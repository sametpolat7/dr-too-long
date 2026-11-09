function setPopoverOpen(open: boolean) {
  return function (this: HTMLElement) {
    if (!this.hasAttribute('popover')) {
      throw new DOMException('The element is not a popover.', 'NotSupportedError');
    }
    this.toggleAttribute('data-popover-open', open);
  };
}

if (typeof HTMLElement.prototype.showPopover !== 'function') {
  HTMLElement.prototype.showPopover = setPopoverOpen(true);
  HTMLElement.prototype.hidePopover = setPopoverOpen(false);
}

if (typeof document.elementsFromPoint !== 'function') {
  document.elementsFromPoint = () => [];
}
