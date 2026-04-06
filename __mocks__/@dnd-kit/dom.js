const PointerSensor = {
  configure: (options) => options
};

const KeyboardSensor = {
  configure: (options) => options
};

const PointerActivationConstraints = {
  Distance: class {
    constructor(options) {
      this.options = options;
    }
  }
};

module.exports = {
  PointerSensor,
  KeyboardSensor,
  PointerActivationConstraints
};
