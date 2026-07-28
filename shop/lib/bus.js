// Tiny wrapper so route modules can push live updates without importing the server.
let io = null;

function setIo(instance) {
  io = instance;
}

/**
 * Tell every signed-in screen that a slice of data changed.
 * The client refetches that slice — simpler and more reliable than diffing.
 */
function broadcast(channel, payload = {}) {
  if (io) io.to('shop').emit('changed', { channel, ...payload });
}

module.exports = { setIo, broadcast };
