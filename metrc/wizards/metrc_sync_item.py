from odoo import fields, models, api


class SyncMetrcItem(models.TransientModel):
    _name = 'metrc.sync.item'

    all_facilities = fields.Boolean('All Facilities', store=True, default=False)
    facility_ids = fields.Many2many('metrc.facility', string='Facility Id')
    product_id = fields.Many2one('product.template', string='Product', readonly=True)

    @api.onchange('all_facilities')
    def _onchange_all_facilities(self):
        facility_ids = self.env['metrc.facility'].sudo().search([]).ids
        if self.all_facilities:
            self.write({'facility_ids': facility_ids})
            self.all_facilities = True
        else:
            self.write({'facility_ids': False})
            self.all_facilities = False

    def submit_sync(self):
        account = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1)
        if account:
            res = account.create_item(self)
            if res:
                return self.env['metrc.message.wizard'].sudo().popup_message('Failed', res)
            else:
                return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Item.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')
