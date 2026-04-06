const React = require('react');

function DragDropProvider({ children, ...props }) {
  return React.createElement(React.Fragment, null, children);
}

function DragOverlay({ children }) {
  return React.createElement(React.Fragment, null, children);
}

function useDraggable() {
  return {
    isDragSource: false,
    ref: () => {},
    handleRef: () => {}
  };
}

function useDragDropMonitor(_handlers) {
  // noop
}

module.exports = {
  DragDropProvider,
  DragOverlay,
  useDraggable,
  useDragDropMonitor
};
