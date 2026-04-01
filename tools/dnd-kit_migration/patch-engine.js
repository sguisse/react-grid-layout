
const fs = require("fs");

function applyPatch(patch) {
  const { type, file, content, anchor } = patch;

  let data = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";

  if (type === "append") {
    data += "\n" + content;
  }

  if (type === "insert" && anchor) {
    const index = data.indexOf(anchor);
    if (index !== -1) {
      data = data.slice(0, index) + content + data.slice(index);
    }
  }

  if (type === "replace") {
    data = content;
  }

  fs.writeFileSync(file, data);
  console.log("✔ Patch applied:", file);
}

function applyAll(patches) {
  patches.forEach(applyPatch);
}

module.exports = { applyAll };
