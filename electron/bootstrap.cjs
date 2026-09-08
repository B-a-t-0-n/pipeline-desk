const {app} = require('electron');
const {configurePlatform} = require('./platform.cjs');

// Ozone chooses its backend before application JavaScript runs. A direct
// invocation of the ELF must restart with X11 on the process command line.
if (configurePlatform(app)) require('./main.cjs');
