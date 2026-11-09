// happy-dom has the popover attribute but cannot show or hide a popover. These stand-ins throw, as
// Chrome does, on an element that is not a popover, and keep the state in an attribute tests read.
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
