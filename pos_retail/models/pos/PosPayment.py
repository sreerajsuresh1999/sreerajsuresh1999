from odoo import api, fields, models, _
from odoo.tools import formatLang


class PosPayment(models.Model):
    _inherit = "pos.payment"

    voucher_id = fields.Many2one('pos.voucher', 'Voucher')
    voucher_code = fields.Char('Voucher Code')
    pos_branch_id = fields.Many2one('pos.branch', string='Branch')
    ref = fields.Char('Ref')
    cheque_owner = fields.Char('Cheque Owner')
    cheque_bank_account = fields.Char('Cheque Bank Account')
    cheque_bank_id = fields.Many2one('res.bank', 'Cheque Bank')
    cheque_check_number = fields.Char('Cheque Check Number')
    cheque_card_name = fields.Char('Cheque Card Name')
    cheque_card_number = fields.Char('Cheque Card Number')
    cheque_card_type = fields.Char('Cheque Card Type')

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        payment = super(PosPayment, self).create(vals)
        payment_method = payment.payment_method_id
        if payment_method.cash_journal_id and payment_method.cash_journal_id.pos_method_type != 'default':
            Credit = self.env['res.partner.credit']
            pos_method_type = payment_method.cash_journal_id.pos_method_type
            if pos_method_type == 'voucher' and payment.voucher_id:
                if payment.voucher_id.apply_type == 'percent':
                    payment.voucher_id.write({'state': 'used', 'use_date': fields.Datetime.now()})
                    self.env['pos.voucher.use.history'].create({
                        'pos_order_id': payment.pos_order_id.id,
                        'payment_id': payment.id,
                        'voucher_id': payment.voucher_id.id,
                        'value': payment.amount,
                        'used_date': fields.Datetime.now(),
                        'cashier_id': self.env.user.id
                    })
                else:
                    amount = payment.amount
                    if (payment.voucher_id.value - amount) <= 0:
                        payment.voucher_id.write({
                            'state': 'used',
                            'use_date': fields.Datetime.now(),
                            'value': 0,
                        })
                    else:
                        payment.voucher_id.write({'value': (payment.voucher_id.value - amount)})
                    self.env['pos.voucher.use.history'].create({
                        'pos_order_id': payment.pos_order_id.id,
                        'payment_id': payment.id,
                        'cashier_id': self.env.user.id,
                        'voucher_id': payment.voucher_id.id,
                        'value': payment.amount,
                        'used_date': fields.Datetime.now()
                    })
            if pos_method_type == 'credit' and payment.pos_order_id.partner_id:
                Credit.create({
                    'name': payment.pos_order_id.name,
                    'type': 'redeem',
                    'amount': payment.amount,
                    'pos_order_id': payment.pos_order_id.id,
                    'partner_id': payment.pos_order_id.partner_id.id,
                })
        return payment
