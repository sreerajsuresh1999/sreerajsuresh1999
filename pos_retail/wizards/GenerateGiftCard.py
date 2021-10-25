# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class GenerateGiftCard(models.TransientModel):
    _inherit = 'coupon.generate.wizard'

    def generate_giftcards(self, partner_id, pos_config_id):
        """
        Generates the number of gift cards from POS
        """
        program = self.env['coupon.program'].browse(self.env.context.get('active_id'))
        couponObj = self.env['coupon.coupon'].sudo()
        vals = {
            'program_id': program.id,
            'base_amount': program.reward_id.discount_fixed_amount,
            'state': 'draft',
            'pos_create_date': fields.Datetime.now(),
            'pos_create_uid': self.env.user.id,
            'pos_config_id': pos_config_id
        }
        if partner_id:
            vals.update({
                'partner_id': partner_id
            })
        coupon_ids = []
        if program.maximum_cards_create <= 0:
            if self.generation_type == 'nbr_coupon' and self.nbr_coupons > 0:
                for count in range(0, self.nbr_coupons):
                    coupon_ids.append(couponObj.create(vals).id)
        else:
            count_cards = couponObj.search([('program_id', '=', program.id)])
            if (len(count_cards) + self.nbr_coupons) > program.maximum_cards_create:
                raise UserError(_('Gift Card template limited create number is: %s' % program.maximum_cards_create))
        return coupon_ids

    def covert_return_order_to_giftcards(self, program_id, amount_return, partner_id, pos_config_id, origin):
        program = self.env['coupon.program'].browse(program_id)
        couponObj = self.env['coupon.coupon'].sudo()
        couponsExistBefore = couponObj.search([('origin', '=', origin)])
        vals = {
            'coupon_id': None,
            'coupon_code': None,
        }
        if (not couponsExistBefore):
            vals = {
                'origin': 'Order Ref: %s' % origin,
                'program_id': program.id,
                'base_amount': amount_return,
                'state': 'new',
                'pos_create_date': fields.Datetime.now(),
                'pos_create_uid': self.env.user.id,
                'pos_config_id': pos_config_id
            }
            if partner_id:
                vals.update({
                    'partner_id': partner_id
                })
            coupon = couponObj.create(vals)
            vals['coupon_id'] = coupon.id
            vals['coupon_code'] = coupon.code
        else:
            coupon = couponsExistBefore[0]
            vals['coupon_id'] = coupon.id
            vals['coupon_code'] = coupon.code
        return vals

    def remove_giftcards(self, coupon_ids):
        return self.env['coupon.coupon'].sudo().browse(coupon_ids).unlink()
