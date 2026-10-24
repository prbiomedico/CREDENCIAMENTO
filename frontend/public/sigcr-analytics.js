(function () {
  'use strict';
  var routes = ["/", "/login", "/dashboard", "/registradoras-empresa", "/financeiras-empresa", "/portarias", "/planos", "/cadastro", "/selo/:companyId", "/transparencia", "/transparencia/:uf", "/portarias/publico/:token", "/checkout", "/pagamento/aguardando", "/app-mobile", "/documentos/upload", "/mapa-nacional", "/documentos", "/registro-contrato", "/fila-registros", "/credenciamento-portaria", "/detran/conferencia", "/credenciamento/documentos", "/estados", "/registradoras", "/financeiras", "/estados/:sigla", "/mapa", "/editais", "/solicitacoes", "/notificacoes", "/criar-evento", "/acompanhamento", "/acompanhamento/:uf", "/esteiras", "/solicitacoes/:id", "/usuarios", "/auditoria", "/configuracoes"];
  function safePath(value) {
    try {
      var path = new URL(value || '/', window.location.origin).pathname;
      for (var i = 0; i < routes.length; i++) {
        var pattern = '^' + routes[i].split('/').map(function (part) {
          return part.charAt(0) === ':' ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('/') + '/?$';
        if (new RegExp(pattern).test(path)) return routes[i];
      }
    } catch (e) {}
    return '/outra-tela';
  }
  window.sigcrAnalyticsBeforeSend = function (type, payload) {
    if (type !== 'event') return false;
    // Somente visualizações; nenhum conteúdo de formulário ou identificador.
    if (payload.name) return false;
    return {
      website: payload.website,
      hostname: window.location.hostname,
      language: payload.language,
      screen: payload.screen,
      url: safePath(payload.url),
      title: 'SIGCR',
      referrer: (function () {
        try {
          var ref = new URL(payload.referrer);
          return ref.hostname === window.location.hostname ? '' : ref.origin;
        } catch (e) { return ''; }
      })()
    };
  };
}());
