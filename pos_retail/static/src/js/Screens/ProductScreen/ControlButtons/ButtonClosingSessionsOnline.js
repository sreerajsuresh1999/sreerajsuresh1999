odoo.define('pos_retail.ButtonClosingSessionsOnline', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonClosingSessionsOnline extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            let sessionsOnline = await this.rpc({
                model: 'pos.session',
                method: 'search_read',
                domain: [['state', '!=', 'closed']],
                fields: ['id', 'name', 'config_id']
            })
            sessionsOnline.forEach(s => {
                s.name = s.config_id[1] + this.env._t(' with Session') + s.name
            })
            if (sessionsOnline.length == 0) {
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Successfully'),
                    body: this.env._t('Have not any Sessions Online need close !')
                })
            }
            let {confirmed, payload: result} = await this.showPopup('PopUpSelectionBox', {
                title: this.env._t('Select Sessions need Closing and Posting'),
                items: sessionsOnline,
                confirmText: 'Closing Selected Sessions',
                cancelText: 'Close',
            })
            if (confirmed) {
                if (result.items.length) {
                    let closeSelfSession = result.items.find(s => s.id == this.env.pos.pos_session.id)
                    if (closeSelfSession) {
                        let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('Alert'),
                            body: this.env._t('Are you want closing your POS Session ?'),
                            confirmText: 'Closing Now',
                            cancelText: 'No',
                        })
                        if (!confirmed) {
                            return true
                        }
                    }
                    const sessionsWillClosing = []
                    result.items.forEach(s => {
                        sessionsWillClosing.push(s.id)
                    })
                    await this.rpc({
                        model: 'pos.session',
                        method: 'force_action_pos_session_close',
                        args: [sessionsWillClosing]
                    });
                    if (closeSelfSession) {
                        let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('Alert'),
                            body: this.env._t('Your POS Session closed and posted. Are you want logout of POS now ?'),
                            confirmText: 'Closing Now',
                            cancelText: 'No',
                        })
                        if (confirmed) {
                            window.location = '/web#action=point_of_sale.action_client_pos_menu';
                        }
                    } else {
                        this.onClick()
                    }
                } else {
                    return this.showPopup('ConfirmPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Please select one session need close !')
                    })
                }
            }
        }
    }

    ButtonClosingSessionsOnline.template = 'ButtonClosingSessionsOnline';

    ProductScreen.addControlButton({
        component: ButtonClosingSessionsOnline,
        condition: function () {
            return this.env.pos.config.allow_closing_all_sessions_online;
        },
    });

    Registries.Component.add(ButtonClosingSessionsOnline);

    return ButtonClosingSessionsOnline;
});
