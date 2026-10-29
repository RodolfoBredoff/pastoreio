// CloudFront Function (viewer-request) da página estática de lista de presença.
// Atende o roteamento /lista-presenca-app/* (teste) ou /lista-presenca/* (link real).
// O plano gratuito do CloudFront limita a 5 roteamentos, então página, arquivos e
// snapshot passam todos por um único roteamento e são mapeados aqui para o S3:
//
//   <prefixo>/assets/<arquivo>        -> /lista-presenca-app/assets/<arquivo>
//   <prefixo>/pastoreio.svg           -> /lista-presenca-app/pastoreio.svg
//   <prefixo>/snapshots/<slug>.json   -> /snapshots/lista-presenca/<slug>.json
//   <prefixo>/<qualquer outra coisa>  -> /lista-presenca-app/index.html
var SLUG_JSON = /^[a-z0-9-]{1,120}\.json$/;

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var rest = '';

  if (uri.indexOf('/lista-presenca-app/') === 0) {
    rest = uri.substring('/lista-presenca-app/'.length);
  } else if (uri.indexOf('/lista-presenca/') === 0) {
    rest = uri.substring('/lista-presenca/'.length);
  }

  if (rest.indexOf('assets/') === 0 || rest === 'pastoreio.svg') {
    request.uri = '/lista-presenca-app/' + rest;
  } else if (rest.indexOf('snapshots/') === 0 && SLUG_JSON.test(rest.substring('snapshots/'.length))) {
    request.uri = '/snapshots/lista-presenca/' + rest.substring('snapshots/'.length);
  } else {
    request.uri = '/lista-presenca-app/index.html';
  }
  return request;
}
