odoo.define('point_of_sale.LanguageSelection', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class LanguageSelection extends PosComponent {
        constructor() {
            super(...arguments);
        }

        async onClick() {
            let languages = []
            for (let i = 0; i < this.env.pos.langs.length; i++) {
                let lang = this.env.pos.langs[i]
                languages.push({
                    id: lang.id,
                    label: lang.name,
                    item: lang,
                })
            }
            if (languages.length != 0) {
                let {confirmed, payload: lang} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Change Language'),
                    list: languages,
                })
                if (confirmed) {
                    await this.rpc({
                        model: 'res.users',
                        method: 'write',
                        args: [[this.env.pos.session.user_id[0]], {'lang': lang.code}],
                    })
                    this.env.pos.do_action({
                        type: 'ir.actions.client',
                        res_model: 'res.users',
                        tag: 'reload_context',
                        target: 'current',
                    });
                    owl.Component.env.qweb.forceUpdate();
                }
            }
        }
    }

    LanguageSelection.template = 'LanguageSelection';

    Registries.Component.add(LanguageSelection);

    return LanguageSelection;
});
