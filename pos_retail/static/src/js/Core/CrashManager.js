odoo.define('pos_retail.CrashManager', function (require) {
    "use strict";

    // ---------- *** -----------------
    // TODO: on pos interface, we dont want display any error issue of backend, we dont care about it
    // We keep simple screen nothing error popup (issues of backend) for keep sale products , dont want spent times of pos users
    // ---------- *** -----------------

    var core = require('web.core');
    var CrashManager = require('web.CrashManager').CrashManager;
    var _t = core._t;

    CrashManager.include({
        init: function () {
            this._super.apply(this, arguments);
            window.onerror = function (message, file, line, col, error) {
                if (!file && !line && !col) {
                    if (window.onOriginError) {
                        window.onOriginError();
                        delete window.onOriginError;
                    } else {
                        self.show_error({
                            type: _t("Odoo Client Error"),
                            message: _t("Unknown CORS error"),
                            data: {debug: _t("An unknown CORS error occured. The error probably originates from a JavaScript file served from a different origin. (Opening your browser console might give you a hint on the error.)")},
                        });
                    }
                } else {
                    if (!error && message === 'ResizeObserver loop limit exceeded') {
                        return;
                    }
                    var traceback = error ? error.stack : '';
                    let log = file + ':' + line + "\n" + _t('Traceback:') + "\n" + traceback
                    console.error(message)
                    console.error(log)

                }
            };
        },


    });

});
