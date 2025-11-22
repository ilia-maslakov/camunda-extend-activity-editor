'use strict';

function focusAndSelectElement(elementId, plugin) {
  const elementRegistry = plugin._elementRegistry;
  const canvas = plugin._canvas;
  const selection = plugin._selection;

  let element = elementRegistry.get(elementId);

  if (!element) {
    element = elementRegistry.filter(e =>
      e.businessObject &&
      e.businessObject.eventDefinitions &&
      e.businessObject.eventDefinitions.some(def =>
        def.messageRef && def.messageRef.id === elementId
      )
    )[0];
  }

  if (!element) {
    console.warn('Element ' + elementId + ' not found');
    return;
  }

  Object.keys(elementRegistry._elements).forEach(key => {
    const e = elementRegistry._elements[key].element;
    canvas.removeMarker(e, 'highlight');
  });
  canvas.addMarker(element, 'highlight');

  if (selection && typeof selection.select === 'function') {
    selection.select(element);
  }

  try {
    let bbox;
    if (typeof canvas.getAbsoluteBBox === 'function') {
      bbox = canvas.getAbsoluteBBox(element);
    } else {
      const gfx = canvas.getGraphics(element);
      bbox = gfx && gfx.getBBox ? gfx.getBBox() : null;
    }

    if (!bbox) {
      console.warn('No bbox for element:', elementId);
      return;
    }

    const viewbox = canvas.viewbox();

    // центр элемента
    const elementCenterX = bbox.x + bbox.width / 2;
    const elementCenterY = bbox.y + bbox.height / 2;

    canvas.viewbox({
      x: elementCenterX - viewbox.width / 2,
      y: elementCenterY - viewbox.height / 2,
      width: viewbox.width,
      height: viewbox.height
    });
  } catch (err) {
    console.warn('Centering failed:', err);
  }
}

module.exports = { focusAndSelectElement };
