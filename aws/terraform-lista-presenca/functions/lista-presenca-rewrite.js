// CloudFront Function (viewer-request) da página estática de lista de presença.
// /lista-presenca/<slug> e /lista-presenca-app/<slug> -> /lista-presenca-app/index.html
// Arquivos (com extensão, ex.: /lista-presenca-app/assets/index-abc.js) passam sem alteração.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  if (last.indexOf('.') !== -1) {
    return request;
  }
  request.uri = '/lista-presenca-app/index.html';
  return request;
}
