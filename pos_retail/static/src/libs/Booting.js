odoo.define('pos_retail.web_client', function (require) {
    'use strict';


    // TODO: backend and booting datas products and partners for pos
    const  WebClient = require('web.WebClient');
    const indexed_db = require('pos_retail.indexedDB');

    WebClient.include({
        async startPosApp(webClient, indexed_db) {
            let initIndexDB = new indexed_db(webClient.env.session);
            await initIndexDB.get_datas('product.product', 100)
            await initIndexDB.get_datas('res.partner', 100)
            webClient.env.session.indexed_db = initIndexDB;
        },

        show_application: function () {
            const res = this._super.apply(this, arguments);
            this.startPosApp(this, indexed_db);
            return res
        },
    });
});
