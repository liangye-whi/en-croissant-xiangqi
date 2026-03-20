import { HeadlessState } from './state.js';
import { setVisible, createEl } from './util.js';
import { colors, fileNums, Elements } from './types.js';
import { createElement as createSVG, setAttributes, createDefs } from './svg.js';

export function renderWrap(element: HTMLElement, s: HeadlessState): Elements {
  // .cg-wrap (element passed to Xiangqiground)
  //   cg-container
  //     cg-board
  //     svg.cg-shapes
  //       defs
  //       g
  //     svg.cg-custom-svgs
  //       g
  //     cg-auto-pieces
  //     coords.ranks
  //     coords.files
  //     piece.ghost

  element.innerHTML = '';

  // ensure the cg-wrap class is set
  // so bounds calculation can use the CSS width/height values
  // add that class yourself to the element before calling xiangqiground
  // for a slight performance improvement! (avoids recomputing style)
  element.classList.add('cg-wrap');

  for (const c of colors) element.classList.toggle('orientation-' + c, s.orientation === c);
  element.classList.toggle('manipulable', !s.viewOnly);

  const container = createEl('cg-container');
  element.appendChild(container);

  if (s.coordinates) {
    container.appendChild(renderCoords(fileNums, 'files top'));
  }

  const board = createEl('cg-board');
  container.appendChild(board);

  let svg: SVGElement | undefined;
  let customSvg: SVGElement | undefined;
  let autoPieces: HTMLElement | undefined;

  if (s.drawable.visible) {
    svg = setAttributes(createSVG('svg'), {
      class: 'cg-shapes',
      viewBox: '-4 -4 9 10',
      preserveAspectRatio: 'xMidYMid slice',
    });
    svg.appendChild(createDefs());
    svg.appendChild(createSVG('g'));

    customSvg = setAttributes(createSVG('svg'), {
      class: 'cg-custom-svgs',
      viewBox: '-3.5 -3.5 9 10',
      preserveAspectRatio: 'xMidYMid slice',
    });
    customSvg.appendChild(createSVG('g'));

    autoPieces = createEl('cg-auto-pieces');

    container.appendChild(svg);
    container.appendChild(customSvg);
    container.appendChild(autoPieces);
  }

  if (s.coordinates) {
    container.appendChild(renderCoords(fileNums, 'files rev'));
  }

  let ghost: HTMLElement | undefined;
  if (s.draggable.enabled && s.draggable.showGhost) {
    ghost = createEl('piece', 'ghost');
    setVisible(ghost, false);
    container.appendChild(ghost);
  }

  return {
    board,
    container,
    wrap: element,
    ghost,
    svg,
    customSvg,
    autoPieces,
  };
}

function renderCoords(elems: readonly string[], className: string): HTMLElement {
  const el = createEl('coords', className);
  let f: HTMLElement;
  for (const elem of elems) {
    f = createEl('coord');
    f.textContent = elem;
    el.appendChild(f);
  }
  return el;
}
