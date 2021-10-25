odoo.define('pos_retail.AccountMoveDetail', function (require) {
    'use strict';

    const {getDataURLFromFile} = require('web.utils');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const core = require('web.core');
    const qweb = core.qweb;
    const {posbus} = require('point_of_sale.utils');

    class AccountMoveDetail extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('actionConfirm', () => this.actionConfirm());
            useListener('actionPreview', () => this.actionPreview());
            useListener('actionCancelEntry', () => this.actionCancelEntry());
            useListener('actionResetDraft', () => this.actionResetDraft());
        }

        async actionConfirm() {
            await this.rpc({
                model: 'account.move',
                method: 'action_post',
                args:
                    [[this.props.move.id]],
                context: {
                    pos: true
                }
            })
            await this.env.pos.getAccountMoves();
            var newMove = this.env.pos.db.invoice_by_id[this.props.move.id];
            this.props.move = newMove;
            this.render()
        }

        async actionPreview() {
            const link = await this.rpc({
                model: 'account.move',
                method: 'preview_invoice',
                args:
                    [[this.props.move.id]],
                context: {
                    pos: true
                }
            })
            window.open(window.location.origin + link.url, '_blank')
        }

        async actionCancelEntry() {
            await this.rpc({
                model: 'account.move',
                method: 'button_cancel',
                args:
                    [[this.props.move.id]],
                context: {
                    pos: true
                }
            }, {
                shadow: true,
                timeout: 65000
            })
            await this.env.pos.getAccountMoves();
            var newMove = this.env.pos.db.invoice_by_id[this.props.move.id];
            this.props.move = newMove;
            this.render()
        }

        async actionResetDraft() {
            await this.rpc({
                model: 'account.move',
                method: 'button_draft',
                args:
                    [[this.props.move.id]],
                context: {
                    pos: true
                }
            }, {
                shadow: true,
                timeout: 65000
            })
            await this.env.pos.getAccountMoves();
            var newMove = this.env.pos.db.invoice_by_id[this.props.move.id];
            this.props.move = newMove;
            this.render()
        }

        get partnerImageUrl() {
            const move = this.props.move;
            const partner = move.partner_id
            if (partner) {
                return `/web/image?model=res.partner&id=${partner[0]}&field=image_128&unique=1`;
            } else {
                return false;
            }
        }

        get OrderUrl() {
            const move = this.props.move;
            return window.location.origin + "/web#id=" + move.id + "&view_type=form&model=account.move";
        }
    }

    AccountMoveDetail.template = 'AccountMoveDetail';

    Registries.Component.add(AccountMoveDetail);

    return AccountMoveDetail;
});
