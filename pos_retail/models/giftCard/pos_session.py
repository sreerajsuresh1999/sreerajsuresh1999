# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _get_split_receivable_vals(self, payment, amount, amount_converted):
        partial_vals = {
            'account_id': payment.payment_method_id.receivable_account_id.id,
            'move_id': self.move_id.id,
            'partner_id': self.env["res.partner"]._find_accounting_partner(payment.partner_id).id,
            'name': '%s - %s' % (self.name, payment.payment_method_id.name),
        }
        if payment.payment_method_id.jr_use_for:
            partial_vals.update({
                'account_id': self.config_id.gift_card_account_id.id,
            })
        return self._debit_amounts(partial_vals, amount, amount_converted)
    
    def _get_combine_receivable_vals(self, payment_method, amount, amount_converted):
        partial_vals = {
            'account_id': payment_method.receivable_account_id.id,
            'move_id': self.move_id.id,
            'name': '%s - %s' % (self.name, payment_method.name)
        }
        if payment_method.jr_use_for:
            partial_vals.update({
                'account_id': self.config_id.gift_card_account_id.id,
            })
        return self._debit_amounts(partial_vals, amount, amount_converted)

    def _prepare_line(self, order_line):
        res = super(PosSession, self)._prepare_line(order_line)
        if self.config_id.enable_gift_card and (order_line.product_id.id == self.config_id.gift_card_product_id.id):
            res.update({
                'income_account_id': self.config_id.gift_card_account_id.id,
            })
        return res

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
