use std::{
    fmt::Display,
    path::PathBuf,
    process::Stdio,
    sync::Arc,
    time::{Duration, Instant},
};

use derivative::Derivative;
use governor::{Quota, RateLimiter};
use log::{error, info};
use nonzero_ext::*;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};
use vampirc_uci::{
    parse_one,
    uci::{Score, ScoreValue},
    UciInfoAttribute, UciMessage, UciOptionConfig,
};

use crate::{
    db::{is_position_in_db, GameQueryJs, PositionQueryJs},
    error::Error,
    AppState,
};

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum EngineLog {
    Gui(String),
    Engine(String),
}

#[derive(Debug)]
pub struct EngineProcess {
    stdin: ChildStdin,
    last_depth: u32,
    best_moves: Vec<BestMoves>,
    last_best_moves: Vec<BestMoves>,
    last_progress: f32,
    options: EngineOptions,
    requested_options: EngineOptions,
    go_mode: GoMode,
    running: bool,
    real_multipv: u16,
    logs: Vec<EngineLog>,
    start: Instant,
}

impl EngineProcess {
    async fn new(path: PathBuf) -> Result<(Self, Lines<BufReader<ChildStdout>>), Error> {
        let mut command = Command::new(&path);
        command.current_dir(path.parent().unwrap());
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command.spawn()?;

        let mut logs = Vec::new();

        let mut stdin = child.stdin.take().ok_or(Error::NoStdin)?;

        tokio::spawn(async move {
            let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();
            while let Some(line) = stderr.next_line().await.unwrap() {
                error!("{}", &line);
            }
        });

        let mut lines = BufReader::new(child.stdout.take().ok_or(Error::NoStdout)?).lines();

        let _ = stdin.write_all("uci\n".as_bytes()).await;
        logs.push(EngineLog::Gui("uci\n".to_string()));
        while let Some(line) = lines.next_line().await? {
            logs.push(EngineLog::Engine(line.clone()));
            if line == "uciok" {
                let _ = stdin.write_all("isready\n".as_bytes()).await;
                logs.push(EngineLog::Gui("isready\n".to_string()));
                while let Some(line_is_ready) = lines.next_line().await? {
                    logs.push(EngineLog::Engine(line_is_ready.clone()));
                    if line_is_ready == "readyok" {
                        break;
                    }
                }
                break;
            }
        }

        Ok((
            Self {
                stdin,
                last_depth: 0,
                best_moves: Vec::new(),
                last_best_moves: Vec::new(),
                last_progress: 0.0,
                logs,
                options: EngineOptions::default(),
                requested_options: EngineOptions::default(),
                real_multipv: 0,
                go_mode: GoMode::Infinite,
                running: false,
                start: Instant::now(),
            },
            lines,
        ))
    }

    async fn set_option<T>(&mut self, name: &str, value: T) -> Result<(), Error>
    where
        T: Display,
    {
        let msg = format!("setoption name {} value {}\n", name, value);
        info!("[analysis] gui -> engine: {}", msg.trim_end());
        self.stdin.write_all(msg.as_bytes()).await?;
        self.logs.push(EngineLog::Gui(msg));

        Ok(())
    }

    async fn set_options(&mut self, options: EngineOptions) -> Result<(), Error> {
        let normalized_fen = normalize_fen(&options.fen);
        let multipv = options
            .extra_options
            .iter()
            .find(|x| x.name == "MultiPV")
            .map(|x| x.value.parse().unwrap_or(1))
            .unwrap_or(1)
            .max(1);

        self.real_multipv = multipv;

        for option in &options.extra_options {
            if !self.options.extra_options.contains(option) {
                self.set_option(&option.name, &option.value).await?;
            }
        }

        if normalized_fen != self.options.fen || options.moves != self.options.moves {
            self.set_position(&normalized_fen, &options.moves).await?;
        }
        self.last_depth = 0;
        self.options = EngineOptions {
            fen: normalized_fen,
            ..options.clone()
        };
        self.best_moves.clear();
        self.last_best_moves.clear();
        Ok(())
    }

    fn set_requested_options(&mut self, options: EngineOptions) {
        self.requested_options = EngineOptions {
            fen: normalize_fen(&options.fen),
            moves: options.moves,
            extra_options: options.extra_options,
        };
    }

    async fn set_position(&mut self, fen: &str, moves: &Vec<String>) -> Result<(), Error> {
        let fen = normalize_fen(fen);
        let msg = if moves.is_empty() {
            format!("position fen {}\n", fen)
        } else {
            format!("position fen {} moves {}\n", fen, moves.join(" "))
        };

        info!("[analysis] gui -> engine: {}", msg.trim_end());
        self.stdin.write_all(msg.as_bytes()).await?;
        self.options.fen = fen;
        self.options.moves = moves.clone();
        self.logs.push(EngineLog::Gui(msg));
        Ok(())
    }

    async fn go(&mut self, mode: &GoMode) -> Result<(), Error> {
        self.go_mode = mode.clone();
        let msg = match mode {
            GoMode::Depth(depth) => format!("go depth {}\n", depth),
            GoMode::Time(time) => format!("go movetime {}\n", time),
            GoMode::Nodes(nodes) => format!("go nodes {}\n", nodes),
            GoMode::PlayersTime(PlayersTime {
                white,
                black,
                winc,
                binc,
            }) => {
                format!(
                    "go wtime {} btime {} winc {} binc {}\n",
                    white, black, winc, binc
                )
            }
            GoMode::Infinite => "go infinite\n".to_string(),
        };
        info!("[analysis] gui -> engine: {}", msg.trim_end());
        self.stdin.write_all(msg.as_bytes()).await?;
        self.logs.push(EngineLog::Gui(msg));
        self.running = true;
        self.start = Instant::now();
        Ok(())
    }

    async fn stop(&mut self) -> Result<(), Error> {
        info!("[analysis] gui -> engine: stop");
        self.stdin.write_all(b"stop\n").await?;
        self.logs.push(EngineLog::Gui("stop\n".to_string()));
        self.running = false;
        Ok(())
    }

    async fn kill(&mut self) -> Result<(), Error> {
        info!("[analysis] gui -> engine: quit");
        self.stdin.write_all(b"quit\n").await?;
        self.logs.push(EngineLog::Gui("quit\n".to_string()));
        self.running = false;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AnalysisCacheKey {
    pub tab: String,
    pub fen: String,
    pub engine: String,
    pub multipv: u16,
}

#[derive(Clone, Serialize, Debug, Derivative, Type)]
#[derivative(Default)]
pub struct BestMoves {
    nodes: u32,
    depth: u32,
    score: Score,
    #[serde(rename = "uciMoves")]
    uci_moves: Vec<String>,
    #[serde(rename = "sanMoves")]
    san_moves: Vec<String>,
    #[derivative(Default(value = "1"))]
    multipv: u16,
    nps: u32,
}

#[derive(Serialize, Debug, Clone, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct BestMovesPayload {
    pub best_lines: Vec<BestMoves>,
    pub engine: String,
    pub tab: String,
    pub fen: String,
    pub moves: Vec<String>,
    pub progress: f64,
}

fn invert_score(score: Score) -> Score {
    let new_value = match score.value {
        ScoreValue::Cp(x) => ScoreValue::Cp(-x),
        ScoreValue::Mate(x) => ScoreValue::Mate(-x),
    };
    let new_wdl = score.wdl.map(|(w, d, l)| (l, d, w));
    Score {
        value: new_value,
        wdl: new_wdl,
        ..score
    }
}

fn is_black_turn_in_fen(fen: &str) -> bool {
    matches!(fen.split_whitespace().nth(1), Some("b" | "black"))
}

fn normalize_turn(turn: &str) -> &str {
    match turn {
        "black" | "b" => "b",
        "white" | "w" | "red" => "w",
        other => other,
    }
}

fn normalize_fen(fen: &str) -> String {
    let parts: Vec<&str> = fen.split_whitespace().collect();
    if parts.is_empty() {
        return fen.trim().to_string();
    }

    let board = parts[0];
    let turn = parts.get(1).copied().map(normalize_turn).unwrap_or("w");

    match parts.len() {
        1 | 2 => format!("{board} {turn} - - 0 1"),
        4 => format!("{board} {turn} - - {} {}", parts[2], parts[3]),
        len if len >= 6 => format!(
            "{board} {turn} {} {} {} {}",
            parts[2], parts[3], parts[4], parts[5]
        ),
        _ => fen.trim().to_string(),
    }
}

fn extract_pv_from_info_line(line: &str) -> Vec<String> {
    let mut parts = line.split_whitespace();

    while let Some(part) = parts.next() {
        if part == "pv" {
            return parts.map(|mv| mv.to_string()).collect();
        }
    }

    Vec::new()
}

fn parse_uci_attrs(
    attrs: Vec<UciInfoAttribute>,
    fen: &str,
    raw_line: &str,
) -> Result<BestMoves, Error> {
    let mut best_moves = BestMoves::default();

    for a in attrs {
        match a {
            UciInfoAttribute::Nps(nps) => {
                best_moves.nps = nps as u32;
            }
            UciInfoAttribute::Nodes(nodes) => {
                best_moves.nodes = nodes as u32;
            }
            UciInfoAttribute::Depth(depth) => {
                best_moves.depth = depth;
            }
            UciInfoAttribute::MultiPv(multipv) => {
                best_moves.multipv = multipv;
            }
            UciInfoAttribute::Score(score) => {
                best_moves.score = score;
            }
            _ => (),
        }
    }

    // Pikafish emits xiangqi PV moves like "h9g7" that vampirc_uci does not
    // reliably surface via UciInfoAttribute::Pv, so we extract the raw PV tail
    // directly from the original info line.
    let pv_moves = extract_pv_from_info_line(raw_line);
    best_moves.san_moves = pv_moves.clone();
    best_moves.uci_moves = pv_moves;

    if best_moves.san_moves.is_empty() {
        return Err(Error::NoMovesFound);
    }

    if is_black_turn_in_fen(fen) {
        best_moves.score = invert_score(best_moves.score);
    }

    Ok(best_moves)
}

fn start_engine(path: PathBuf) -> Result<Child, Error> {
    let mut command = Command::new(&path);
    command.current_dir(path.parent().unwrap());
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn()?;

    Ok(child)
}

fn get_handles(child: &mut Child) -> Result<(ChildStdin, Lines<BufReader<ChildStdout>>), Error> {
    let stdin = child.stdin.take().ok_or(Error::NoStdin)?;
    let stdout = child.stdout.take().ok_or(Error::NoStdout)?;
    let stdout = BufReader::new(stdout).lines();
    Ok((stdin, stdout))
}

async fn send_command(stdin: &mut ChildStdin, command: impl AsRef<str>) {
    let command = command.as_ref();
    stdin
        .write_all(command.as_bytes())
        .await
        .expect("Failed to write command");
}

#[derive(Deserialize, Debug, Clone, Type, Derivative, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
#[derivative(Default)]
pub struct EngineOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub extra_options: Vec<EngineOption>,
}

#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct EngineOption {
    name: String,
    value: String,
}

#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
#[serde(tag = "t", content = "c")]
pub enum GoMode {
    PlayersTime(PlayersTime),
    Depth(u32),
    Time(u32),
    Nodes(u32),
    Infinite,
}

#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct PlayersTime {
    white: u32,
    black: u32,
    winc: u32,
    binc: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn kill_engines(tab: String, state: tauri::State<'_, AppState>) -> Result<(), Error> {
    let keys: Vec<_> = state
        .engine_processes
        .iter()
        .map(|x| x.key().clone())
        .collect();
    for key in keys.clone() {
        if key.0.starts_with(&tab) {
            {
                let process = state.engine_processes.get_mut(&key).unwrap();
                let mut process = process.lock().await;
                process.kill().await?;
            }
            state.engine_processes.remove(&key);
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn kill_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let mut process = process.lock().await;
        process.kill().await?;
    }
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn stop_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let mut process = process.lock().await;
        process.stop().await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_engine_logs(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<EngineLog>, Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let process = process.lock().await;
        Ok(process.logs.clone())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_best_moves(
    id: String,
    engine: String,
    tab: String,
    go_mode: GoMode,
    options: EngineOptions,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<(f32, Vec<BestMoves>)>, Error> {
    info!(
        "get_best_moves: id={}, engine={}, tab={}, fen={}, moves_count={}",
        id,
        engine,
        tab,
        options.fen,
        options.moves.len()
    );
    let path = PathBuf::from(&engine);

    let key = (tab.clone(), engine.clone());

    if state.engine_processes.contains_key(&key) {
        {
            let process = state.engine_processes.get_mut(&key).unwrap();
            let mut process = process.lock().await;
            if options == process.options && go_mode == process.go_mode && process.running {
                info!(
                    "[analysis] get_best_moves cache hit: id={}, engine={}, tab={}, fen={}, moves={:?}, progress={}, best_lines={}",
                    id,
                    engine,
                    tab,
                    options.fen,
                    options.moves,
                    process.last_progress,
                    process.last_best_moves.len()
                );
                return Ok(Some((
                    process.last_progress,
                    process.last_best_moves.clone(),
                )));
            }
            info!(
                "[analysis] get_best_moves reusing process: id={}, engine={}, tab={}, fen={}, moves={:?}",
                id,
                engine,
                tab,
                options.fen,
                options.moves
            );
            process.set_requested_options(options.clone());
            process.stop().await?;
        }
        // give time for engine to stop and process previous lines
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        {
            let process = state.engine_processes.get_mut(&key).unwrap();
            let mut process = process.lock().await;
            process.set_options(options.clone()).await?;
            process.go(&go_mode).await?;
        }
        info!(
            "[analysis] get_best_moves scheduled async analysis on existing process: id={}, engine={}, tab={}, fen={}, moves={:?}",
            id,
            engine,
            tab,
            options.fen,
            options.moves
        );
        return Ok(None);
    }

    info!(
        "[analysis] get_best_moves starting new engine process: id={}, engine={}, tab={}, fen={}, moves={:?}",
        id,
        engine,
        tab,
        options.fen,
        options.moves
    );
    let (mut process, mut reader) = EngineProcess::new(path).await?;
    process.set_requested_options(options.clone());
    process.set_options(options.clone()).await?;
    process.go(&go_mode).await?;

    let process = Arc::new(Mutex::new(process));

    state.engine_processes.insert(key.clone(), process.clone());

    let lim = RateLimiter::direct(Quota::per_second(nonzero!(5u32)));

    while let Some(line) = reader.next_line().await? {
        info!("[analysis] engine -> gui: {}", line);
        let mut proc = process.lock().await;
        match parse_one(&line) {
            UciMessage::Info(attrs) => {
                info!("[analysis] parsed info message");
                let best_moves = parse_uci_attrs(attrs, &proc.options.fen, &line);
                match best_moves {
                    Ok(best_moves) => {
                        info!(
                            "[analysis] parse_uci_attrs ok: fen={}, moves={:?}, depth={}, multipv={}, nodes={}, pv_len={}",
                            proc.options.fen,
                            proc.options.moves,
                            best_moves.depth,
                            best_moves.multipv,
                            best_moves.nodes,
                            best_moves.uci_moves.len()
                        );
                    let multipv = best_moves.multipv;
                    let cur_depth = best_moves.depth;
                    let cur_nodes = best_moves.nodes;
                    if multipv as usize == proc.best_moves.len() + 1 {
                        proc.best_moves.push(best_moves);
                        if multipv == proc.real_multipv {
                            if proc.best_moves.iter().all(|x| x.depth == cur_depth)
                                && cur_depth >= proc.last_depth
                                && lim.check().is_ok()
                            {
                                if !proc.running
                                    || proc.options.fen != proc.requested_options.fen
                                    || proc.options.moves != proc.requested_options.moves
                                {
                                    info!(
                                        "[analysis] dropped stale info payload: id={}, tab={}, running={}, fen={}, moves={:?}, requested_fen={}, requested_moves={:?}, depth={}, last_depth={}, best_lines={}",
                                        id,
                                        tab,
                                        proc.running,
                                        proc.options.fen,
                                        proc.options.moves,
                                        proc.requested_options.fen,
                                        proc.requested_options.moves,
                                        cur_depth,
                                        proc.last_depth,
                                        proc.best_moves.len()
                                    );
                                    proc.best_moves.clear();
                                    continue;
                                }
                                info!(
                                    "[analysis] accepted info payload: id={}, tab={}, fen={}, moves={:?}, requested_fen={}, requested_moves={:?}, depth={}, best_lines={}",
                                    id,
                                    tab,
                                    proc.options.fen,
                                    proc.options.moves,
                                    proc.requested_options.fen,
                                    proc.requested_options.moves,
                                    cur_depth,
                                    proc.best_moves.len()
                                );
                                let progress = match proc.go_mode {
                                    GoMode::Depth(depth) => {
                                        (cur_depth as f64 / depth as f64) * 100.0
                                    }
                                    GoMode::Time(time) => {
                                        (proc.start.elapsed().as_millis() as f64 / time as f64)
                                            * 100.0
                                    }
                                    GoMode::Nodes(nodes) => {
                                        (cur_nodes as f64 / nodes as f64) * 100.0
                                    }
                                    GoMode::PlayersTime(_) => 99.99,
                                    GoMode::Infinite => 99.99,
                                };
                                BestMovesPayload {
                                    best_lines: proc.best_moves.clone(),
                                    engine: id.clone(),
                                    tab: tab.clone(),
                                    fen: proc.options.fen.clone(),
                                    moves: proc.options.moves.clone(),
                                    progress,
                                }
                                .emit(&app)?;
                                info!(
                                    "[analysis] emitted best_moves info payload: id={}, tab={}, fen={}, moves={:?}, progress={}, best_lines={}, depth={}",
                                    id,
                                    tab,
                                    proc.options.fen,
                                    proc.options.moves,
                                    progress,
                                    proc.best_moves.len(),
                                    cur_depth
                                );
                                proc.last_depth = cur_depth;
                                proc.last_best_moves = proc.best_moves.clone();
                                proc.last_progress = progress as f32;
                            }
                            proc.best_moves.clear();
                        }
                    }
                    }
                    Err(err) => {
                        info!(
                            "[analysis] parse_uci_attrs failed: fen={}, moves={:?}, error={:?}",
                            proc.options.fen,
                            proc.options.moves,
                            err
                        );
                    }
                }
            }
            UciMessage::BestMove { .. } => {
                info!("[analysis] parsed bestmove message");
                if !proc.running
                    || proc.options.fen != proc.requested_options.fen
                    || proc.options.moves != proc.requested_options.moves
                {
                    info!(
                        "[analysis] dropped stale final payload: id={}, tab={}, running={}, fen={}, moves={:?}, requested_fen={}, requested_moves={:?}, last_depth={}, best_lines={}",
                        id,
                        tab,
                        proc.running,
                        proc.options.fen,
                        proc.options.moves,
                        proc.requested_options.fen,
                        proc.requested_options.moves,
                        proc.last_depth,
                        proc.last_best_moves.len()
                    );
                    continue;
                }
                info!(
                    "[analysis] accepted final payload: id={}, tab={}, fen={}, moves={:?}, requested_fen={}, requested_moves={:?}, last_depth={}, best_lines={}",
                    id,
                    tab,
                    proc.options.fen,
                    proc.options.moves,
                    proc.requested_options.fen,
                    proc.requested_options.moves,
                    proc.last_depth,
                    proc.last_best_moves.len()
                );
                BestMovesPayload {
                    best_lines: proc.last_best_moves.clone(),
                    engine: id.clone(),
                    tab: tab.clone(),
                    fen: proc.options.fen.clone(),
                    moves: proc.options.moves.clone(),
                    progress: 100.0,
                }
                .emit(&app)?;
                info!(
                    "[analysis] emitted best_moves final payload: id={}, tab={}, fen={}, moves={:?}, best_lines={}",
                    id,
                    tab,
                    proc.options.fen,
                    proc.options.moves,
                    proc.last_best_moves.len()
                );
                proc.last_progress = 100.0;
            }
            other => {
                info!("[analysis] parsed non-info message: {:?}", other);
            }
        }
        proc.logs.push(EngineLog::Engine(line));
    }
    info!("Engine process finished: tab: {}, engine: {}", tab, engine);
    state.engine_processes.remove(&key);
    Ok(None)
}

#[derive(Serialize, Debug, Default, Type)]
pub struct MoveAnalysis {
    best: Vec<BestMoves>,
    novelty: bool,
    is_sacrifice: bool,
}

#[derive(Deserialize, Debug, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub annotate_novelties: bool,
    pub reference_db: Option<PathBuf>,
    pub reversed: bool,
}

#[derive(Clone, Type, serde::Serialize, Event)]
pub struct ReportProgress {
    pub progress: f64,
    pub id: String,
    pub finished: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn analyze_game(
    id: String,
    engine: String,
    go_mode: GoMode,
    options: AnalysisOptions,
    uci_options: Vec<EngineOption>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<MoveAnalysis>, Error> {
    let path = PathBuf::from(&engine);
    let mut analysis: Vec<MoveAnalysis> = Vec::new();

    let (mut proc, mut reader) = EngineProcess::new(path).await?;
    let normalized_fen = normalize_fen(&options.fen);
    let mut positions: Vec<(String, Vec<String>, bool)> = vec![(normalized_fen, vec![], false)];
    positions.extend(
        options
            .moves
            .iter()
            .enumerate()
            .map(|(i, _)| {
                (
                    normalize_fen(&options.fen),
                    options.moves.iter().take(i + 1).cloned().collect(),
                    false,
                )
            }),
    );

    if options.reversed {
        positions.reverse();
    }

    let mut novelty_found = false;

    for (i, (fen, moves, _)) in positions.iter().enumerate() {
        ReportProgress {
            progress: (i as f64 / positions.len() as f64) * 100.0,
            id: id.clone(),
            finished: false,
        }
        .emit(&app)?;

        let mut extra_options = uci_options.clone();
        if !extra_options.iter().any(|x| x.name == "MultiPV") {
            extra_options.push(EngineOption {
                name: "MultiPV".to_string(),
                value: "2".to_string(),
            });
        } else {
            extra_options.iter_mut().for_each(|x| {
                if x.name == "MultiPV" {
                    x.value = "2".to_string();
                }
            });
        }

        proc.set_options(EngineOptions {
            fen: fen.clone(),
            moves: moves.clone(),
            extra_options,
        })
        .await?;

        proc.go(&go_mode).await?;

        let mut current_analysis = MoveAnalysis::default();
        while let Ok(Some(line)) = reader.next_line().await {
            match parse_one(&line) {
                UciMessage::Info(attrs) => {
                    if let Ok(best_moves) = parse_uci_attrs(attrs, &proc.options.fen, &line) {
                        let multipv = best_moves.multipv;
                        let cur_depth = best_moves.depth;
                        if multipv as usize == proc.best_moves.len() + 1 {
                            proc.best_moves.push(best_moves);
                            if multipv == proc.real_multipv {
                                if proc.best_moves.iter().all(|x| x.depth == cur_depth)
                                    && cur_depth >= proc.last_depth
                                {
                                    current_analysis.best = proc.best_moves.clone();
                                    proc.last_depth = cur_depth;
                                }
                                assert_eq!(proc.best_moves.len(), proc.real_multipv as usize);
                                proc.best_moves.clear();
                            }
                        }
                    }
                }
                UciMessage::BestMove { .. } => {
                    break;
                }
                _ => {}
            }
        }
        analysis.push(current_analysis);
    }

    if options.reversed {
        analysis.reverse();
        positions.reverse();
    }

    for (i, analysis) in analysis.iter_mut().enumerate() {
        let query = PositionQueryJs {
            fen: positions[i].0.clone(),
            type_: "exact".to_string(),
        };

        analysis.is_sacrifice = positions[i].2;
        if options.annotate_novelties && !novelty_found {
            if let Some(reference) = options.reference_db.clone() {
                analysis.novelty = !is_position_in_db(
                    reference,
                    GameQueryJs::new().position(query.clone()).clone(),
                    state.clone(),
                )
                .await?;
                if analysis.novelty {
                    novelty_found = true;
                }
            } else {
                return Err(Error::MissingReferenceDatabase);
            }
        }
    }
    ReportProgress {
        progress: 100.0,
        id: id.clone(),
        finished: true,
    }
    .emit(&app)?;
    Ok(analysis)
}

#[derive(Type, Default, Serialize, Debug)]
pub struct EngineConfig {
    pub name: String,
    pub options: Vec<UciOptionConfig>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_engine_config(path: PathBuf) -> Result<EngineConfig, Error> {
    info!(
        "get_engine_config: starting probe for path={}",
        path.display()
    );
    let mut child = start_engine(path)?;
    let stderr = child.stderr.take();
    let (mut stdin, mut stdout) = get_handles(&mut child)?;

    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let mut stderr_lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = stderr_lines.next_line().await {
                info!("get_engine_config stderr: {}", line);
            }
        });
    }

    let init_command = "uci\n";
    info!("get_engine_config gui -> engine: {}", init_command.trim_end());
    send_command(&mut stdin, init_command).await;

    let mut config = EngineConfig::default();
    let probe_deadline = Duration::from_secs(5);

    loop {
        let next_line = tokio::time::timeout(probe_deadline, stdout.next_line()).await;
        let line = match next_line {
            Ok(Ok(Some(line))) => line,
            Ok(Ok(None)) => {
                let status = child.wait().await?;
                return Err(Error::EngineProbeFailed(format!(
                    "engine exited before completing UCI handshake (status: {})",
                    status
                )));
            }
            Ok(Err(err)) => return Err(err.into()),
            Err(_) => {
                return Err(Error::EngineProbeFailed(
                    "timed out waiting for engine handshake response".to_string(),
                ));
            }
        };

        info!("get_engine_config engine -> gui: {}", line);
        if let UciMessage::Id {
            name: Some(name),
            author: _,
        } = parse_one(&line)
        {
            config.name = name;
        }
        if let UciMessage::Option(opt) = parse_one(&line) {
            config.options.push(opt);
        }
        if let UciMessage::UciOk = parse_one(&line) {
            break;
        }
    }
    println!("{:?}", config);
    Ok(config)
}
