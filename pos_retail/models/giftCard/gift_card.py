# -*- coding: utf-8 -*-

from odoo import models, fields, api
import time, datetime
import logging

_logger = logging.getLogger(__name__)


class PosGiftCard(models.Model):
    _name = 'pos.gift.card'
    _rec_name = 'card_no'
    _description = 'Used to Create Gift card.'
    _order = 'id desc'

    @api.model
    def _send_mail_balance_and_expired_coupon(self, expired=False, balance=False):
        today = fields.Date.today()
        this_week_end_date = fields.Date.to_string(fields.Date.from_string(today) + datetime.timedelta(days=7))
        gift_card_ids = self.search([('expire_date', '=', this_week_end_date)])
        template_id = self.env['ir.model.data'].get_object_reference('pos_retail',
                                                                     'email_template_for_coupon_expire_7')
        balance_template_id = self.env['ir.model.data'].get_object_reference('pos_retail',
                                                                             'email_template_regarding_balance1')
        if expired:
            for gift_card in gift_card_ids:
                if template_id and template_id[1]:
                    try:
                        template_obj1 = self.env['mail.template'].browse(template_id[1])
                        template_obj1.send_mail(gift_card.id, force_send=True, raise_exception=False)
                    except Exception as e:
                        _logger.error('Unable to send email for order %s', e)
        if balance:
            for gift_card in self.search([]):
                if balance_template_id and balance_template_id[1]:
                    try:
                        template_obj2 = self.env['mail.template'].browse(balance_template_id[1])
                        template_obj2.send_mail(gift_card.id, force_send=True, raise_exception=False)
                    except Exception as e:
                        _logger.error('Unable to send email for order %s', e)

    def random_cardno(self):
        return int(time.time())

    card_no = fields.Char(string="Card No", default=random_cardno, readonly=True)
    card_value = fields.Float(string="Card Value")
    card_type = fields.Many2one('pos.gift.card.type', string="Card Type")
    customer_id = fields.Many2one('res.partner', string="Customer")
    issue_date = fields.Date(string="Issue Date", default=datetime.datetime.now().strftime("%Y-%m-%d"))
    expire_date = fields.Date(string="Expire Date")
    is_active = fields.Boolean('Active', default=True)
    Paid = fields.Boolean('Paid')
    used_line = fields.One2many('pos.gift.card.use', 'card_id', string="Used Line")
    recharge_line = fields.One2many('pos.gift.card.recharge', 'card_id', string="Recharge Line")

    def write_gift_card_from_ui(self, new_card_no):
        old_card_no = self.card_no
        new_card_no = new_card_no
        if old_card_no != new_card_no:
            new_card = self.search([('card_no', '=', new_card_no)])
            self.write({
                'card_no': new_card_no
            })
            self.env['pos.gift.card.exchange.history'].create({
                'old_card_no': old_card_no, 'new_card_no': new_card_no,
                'customer_id': self.customer_id.id
            })
        try:
            template_id = self.env['ir.model.data'].get_object_reference('pos_retail',
                                                                         'email_template_exchange_number')
            if template_id and template_id[1]:
                template_obj = self.env['mail.template'].browse(template_id[1])
                template_obj.send_mail(self.id, force_send=True, raise_exception=False)
        except Exception as e:
            _logger.error('Unable to send email for order %s', e)


class PosGiftCardUse(models.Model):
    _name = 'pos.gift.card.use'
    _rec_name = 'pos_order_id'
    _description = 'Used to Store Gift Card Uses History.'
    _order = 'id desc'

    card_id = fields.Many2one('pos.gift.card', string="Card", readonly=True)
    customer_id = fields.Many2one('res.partner', string="Customer")
    pos_order_id = fields.Many2one("pos.order", string="Order")
    order_date = fields.Date(string="Order Date")
    amount = fields.Float(string="Amount")

    @api.model
    def create(self, vals):
        res = super(PosGiftCardUse, self).create(vals)
        if res.pos_order_id:
            try:
                template_id = self.env['ir.model.data'].get_object_reference('pos_retail',
                                                                             'email_template_regarding_card_use')
                if template_id and template_id[1]:
                    template_obj = self.env['mail.template'].browse(template_id[1])
                    template_obj.send_mail(res.id, force_send=True, raise_exception=False)
            except Exception as e:
                _logger.error('Unable to send email for order %s', e)
        return res


class PosGiftCardRecharge(models.Model):
    _name = 'pos.gift.card.recharge'
    _rec_name = 'amount'
    _description = 'Used to Store Gift Card Recharge History.'
    _order = 'id desc'

    card_id = fields.Many2one('pos.gift.card', string="Card", readonly=True)
    customer_id = fields.Many2one('res.partner', string="Customer")
    recharge_date = fields.Date(string="Recharge Date")
    user_id = fields.Many2one('res.users', string="User")
    amount = fields.Float(string="amount")


class PosGiftCardType(models.Model):
    _name = 'pos.gift.card.type'
    _rec_name = 'name'
    _description = 'Used to Store Gift Card Type.'

    name = fields.Char(string="Name", required=1)
    code = fields.Char(string=" Code")


class PosGiftCardExchangeHistory(models.Model):
    _name = 'pos.gift.card.exchange.history'
    _description = 'Used to Store Gift Card Exchange History.'

    customer_id = fields.Many2one('res.partner', string="Customer")
    old_card_no = fields.Char(string="Old Card No.", readonly=True)
    new_card_no = fields.Char(string="New Card No.", readonly=True)

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
