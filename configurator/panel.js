// The panel has a real slot grid. Its phase follows the seated assembly's catches.
export function panelLayout(assembly) {
  const hooks = assembly.parts.flatMap(({part, position}) =>
    (part.panelAttachments ?? []).map(attachment => ({
      position: attachment.position.map((n, i) => n + position[i]),
      bladeWidth: attachment.bladeWidth,
    })));
  if (!hooks.length) return null;
  const xs = hooks.map(h => h.position[0]), ys = hooks.map(h => h.position[1]);
  const pitchX = 25.4, pitchY = 50.8;
  const width = Math.max(Math.max(...xs) - Math.min(...xs) + 100, 180);
  const height = Math.max(Math.max(...ys) - Math.min(...ys) + 110, 170);
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const bounds = {left:-width/2, right:width/2, bottom:centerY-height/2, top:centerY+height/2};
  const anchor = hooks[0].position;
  const slots = [], holes = [];
  const xStart = anchor[0] - Math.ceil((anchor[0] - bounds.left) / pitchX) * pitchX;
  const yStart = anchor[1] - Math.ceil((anchor[1] - bounds.bottom) / pitchY) * pitchY;
  for (let x = xStart; x < bounds.right; x += pitchX) {
    for (let y = yStart; y < bounds.top; y += pitchY) {
      if (x - 1.25 > bounds.left + 4 && x + 1.25 < bounds.right - 4 && y - 12.7 > bounds.bottom + 4 && y + 12.7 < bounds.top - 4) slots.push({x, y, width:2.5, height:25.4});
    }
    // Circular perforations between slot columns, at each one-inch row.
    for (let y = yStart; y < bounds.top; y += 25.4) {
      const hx = x + 12.7;
      if (hx - 3.175 > bounds.left + 4 && hx + 3.175 < bounds.right - 4 && y - 3.175 > bounds.bottom + 4 && y + 3.175 < bounds.top - 4) holes.push({x:hx,y,radius:3.175});
    }
  }
  return {bounds, thickness:1.2, hooks, slots, holes};
}
