import type { RefObject, TargetedPointerEvent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { keepInside, viewportSize } from '../viewport.ts';

// Moves the card by a press on its bar's grip or empty space; a press on the shape switch, the
// language field or a button is theirs. A moved card stays inside the viewport as the viewport or
// the card changes size, such as while the points stream in.
export function useDrag(card: RefObject<HTMLElement | null>) {
  // Where the pointer holds the card, from its top left corner.
  const grip = useRef<{ x: number; y: number }>(undefined);

  useEffect(() => {
    const element = card.current;
    if (!element) return;
    const keep = () => {
      const { left, top } = element.style;
      if (left) moveTo(element, Number.parseFloat(left), Number.parseFloat(top));
    };
    const resizes = new ResizeObserver(keep);
    resizes.observe(element);
    window.addEventListener('resize', keep);
    return () => {
      resizes.disconnect();
      window.removeEventListener('resize', keep);
    };
  }, [card]);

  return {
    onPointerDown(event: TargetedPointerEvent<HTMLElement>) {
      const element = card.current;
      const onControl =
        event.target instanceof Element && event.target.closest('fieldset, .picker, button');
      if (!element || event.button !== 0 || onControl) return;
      const box = element.getBoundingClientRect();
      grip.current = { x: event.clientX - box.left, y: event.clientY - box.top };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent) {
      const element = card.current;
      if (element && grip.current) {
        moveTo(element, event.clientX - grip.current.x, event.clientY - grip.current.y);
      }
    },
    onLostPointerCapture() {
      grip.current = undefined;
    },
  };
}

function moveTo(element: HTMLElement, left: number, top: number) {
  const size = { width: element.offsetWidth, height: element.offsetHeight };
  const place = keepInside({ left, top }, size, viewportSize());
  element.style.left = `${place.left}px`;
  element.style.top = `${place.top}px`;
  element.style.right = 'auto';
}
