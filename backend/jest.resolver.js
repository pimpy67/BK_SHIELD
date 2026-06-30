// Resolver personalizzato per aggirare il bug di unrs-resolver su Windows
// (jest-resolve@30.4.1 usa unrs-resolver che richiede un binding nativo MSVC non caricabile)
const path = require('path');

module.exports = (request, options) => {
  return options.defaultResolver(request, options);
};
