odoo.define('web.1200px', function (require) {
    'use strict';

    const AbstractService = require('web.AbstractService');
    const env = require('web.env');
    const WebClient = require('web.web_client');
    const Chrome = require('point_of_sale.Chrome');
    const Registries = require('point_of_sale.Registries');
    const { configureGui } = require('point_of_sale.Gui');

    owl.config.mode = env.isDebug() ? 'dev' : 'prod';
    owl.Component.env = env;

    Registries.Component.add(owl.misc.Portal);

    function setupRetailResponsivePlugin(env) {
        const display_mobile_mode = env.session.config.display_mobile_mode
        const display_mobile_screen_size = env.session.config.display_mobile_screen_size
        let isMobile = () => window.innerWidth <= 1200;
        if (display_mobile_mode && display_mobile_screen_size >= 768) {
            isMobile = () => window.innerWidth <= env.session.config.display_mobile_screen_size;
        }
        env.isMobile = isMobile();
        const updateEnv = owl.utils.debounce(() => {
            if (env.isMobile !== isMobile()) {
                env.isMobile = !env.isMobile;
                env.qweb.forceUpdate();
            }
        }, 15);
        window.addEventListener("resize", updateEnv);
    }

    setupRetailResponsivePlugin(owl.Component.env);

});
