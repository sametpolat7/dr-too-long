import { BUBBLE_UI } from './ui.ts';

// Whether the page shows a box of the element's text: wholly on the screen, inside the part of its
// scroller that shows, and not under a sticky header or the summary window. A text's own boxes
// ignore all of these.
export const isVisible = (box: DOMRect, element: Element): boolean =>
  inSight(box, scrollerOf(element)) && uncovered(box, element);

// Wholly inside the viewport, and inside the part of its scroller that shows.
export function inSight(box: DOMRect, scroller = rootScroller()): boolean {
  const views = [new DOMRect(0, 0, window.innerWidth, window.innerHeight)];
  if (scroller !== rootScroller()) {
    const { top, left } = scroller.getBoundingClientRect();
    const { clientTop, clientLeft, clientWidth, clientHeight } = scroller;
    views.push(new DOMRect(left + clientLeft, top + clientTop, clientWidth, clientHeight));
  }
  return views.every(
    (view) =>
      box.top >= view.top &&
      box.bottom <= view.bottom &&
      box.left >= view.left &&
      box.right <= view.right,
  );
}

// The Summarize button standing over its own text does not cover it.
function uncovered(box: DOMRect, element: Element): boolean {
  const hit = document
    .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    .find((each) => each.localName !== BUBBLE_UI);
  return hit !== undefined && (element.contains(hit) || hit.contains(element));
}

export const rootScroller = (): Element => document.scrollingElement ?? document.documentElement;

export function scrollerOf(element: Element): Element {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const scrolls = /auto|scroll/.test(getComputedStyle(node).overflowY);
    if (scrolls && node.scrollHeight > node.clientHeight) return node;
  }
  return rootScroller();
}
