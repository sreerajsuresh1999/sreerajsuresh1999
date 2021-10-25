odoo.define('pos_retail_offline.web_client', function (require) {
    'use strict';


    const WebClient = require('web.web_client');


    async function registerPosServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('*****  serviceWorker is not available in your browser. ****');
            return;
        }
        try {
            const registration = await navigator.serviceWorker.register('/pos-service-worker', {scope: '/pos/'});
            console.log('serviceWorker registration successful with scope:', registration.scope);
        } catch (error) {
            console.error('serviceWorker registration failed.', error);
        }
    }


    async function startPosApp(webClient) {
        await registerPosServiceWorker();
    }

    startPosApp(WebClient);
    return WebClient;
});
