odoo.define('pos_retail.PosProfiles', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class PosProfiles extends PosComponent {
        async onClick() {
            const self = this
            const posProfiles = await this.rpc({
                model: 'pos.config',
                method: 'search_read',
                domain: [['allow_change_pos_profile', '=', true], ['id', '!=', this.env.pos.config.id]],
                fields: ['name', 'current_session_state']
            }).then(function (values) {
                return values
            }, function (error) {
                self.env.pos.query_backend_fail(error)
                return false
            })
            if (!posProfiles) {
                return false
            }
            if (posProfiles.length > 0) {
                posProfiles.forEach(p => {
                    if (!p.current_session_state) {
                        p.current_session_state = 'closed'
                    }
                })
                this.env.pos.posProfiles = posProfiles
                let list = this.env.pos.posProfiles.map(p => ({
                    id: p.id,
                    item: p,
                    label: p.name + this.env._t(' | State: ') + p.current_session_state
                }));
                let {confirmed, payload: posSelected} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('You Opened [ ') + this.env.pos.config.name + this.env._t(' ]. Are you want switch to another POS Register ?'),
                    list: list,
                })
                if (confirmed) {
                    let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Are you want close POS: ') + this.env.pos.config.name,
                        body: this.env._t('If click [Close and Validate] button, current POS Session will closing automatic and validate'),
                        confirmText: this.env._t('Close and Validate'),
                        cancelText: this.env._t('No')
                    })
                    if (confirmed) {
                        await this.rpc({
                            model: 'pos.session',
                            method: 'action_pos_session_validate',
                            args: [[this.env.pos.pos_session.id]],
                        })
                    }
                    await this.switchPOS(posSelected)

                }
            } else {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Your Point Of Sale only one POS have active [Allow Change POS Profile]. Please active more than 1')
                })
            }

        }

        async switchPOS(posSelected) {
            let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Are you want open POS: ') + posSelected.name,
                body: this.env._t('If you need Log Out of POS System, you can click to [Close] button'),
                confirmText: this.env._t('Go ') + posSelected.name,
                cancelText: this.env._t('Close POS')
            })
            if (confirmed) {
                return window.location = '/pos/web?config_id=' + posSelected.id + '&switchPos=true';
            } else {
                return window.location = '/web/session/logout';
            }
        }

        mounted() {
            super.mounted();
        }

    }

    PosProfiles.template = 'PosProfiles';

    Registries.Component.add(PosProfiles);

    return PosProfiles;
});
