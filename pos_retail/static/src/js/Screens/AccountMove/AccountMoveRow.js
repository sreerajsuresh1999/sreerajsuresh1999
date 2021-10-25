odoo.define('pos_retail.AccountMoveRow', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class AccountMoveRow extends PosComponent {

        get highlight() {
            return this.props.move !== this.props.selectedMove ? '' : 'highlight';
        }

        async _autoSyncBackend() {
            this.env.pos.set_synch('connecting', '')
            console.log('[_autoSyncBackend] Move ID: ' + this.props.move.id)
            let moves = await this.env.pos.getDatasByModel('account.move', [['id', '=', this.props.move.id]])
            if (moves != null) {
                if (moves.length == 1) {
                    this.props.move = moves[0]
                    this.render()
                } else {
                    console.warn('Move has deleted by backend: ' + this.props.move.id)
                }
            } else {
                this.env.pos.set_synch('disconnected', this.env._t('Fail sync'))
            }
            let moveLines = await this.env.pos.getDatasByModel('account.move.line', [['move_id', '=', this.props.move.id]])
            if (moveLines != null) {
                this.props.move['lines'] = moveLines
            } else {
                this.env.pos.set_synch('disconnected', this.env._t('Fail sync'))
            }
            this.env.pos.set_synch('connected', '')
        }
    }

    AccountMoveRow.template = 'AccountMoveRow';

    Registries.Component.add(AccountMoveRow);

    return AccountMoveRow;
});
