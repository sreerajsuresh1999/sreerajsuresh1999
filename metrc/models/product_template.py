from odoo import models, fields


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    metrc_id = fields.Char('METRC ID')
    categ_type = fields.Char('METRC Category Type')
    qty_type = fields.Char('METRC Qty Type')
    def_lab_test_state = fields.Char('Default Lab Testing State')
    u_o_m = fields.Char('Unit Of Measure')
    approve_status = fields.Char('Approval Status')
    approve_status_datetime = fields.Char('Approval Status DateTime')
    strain_id = fields.Char('Strain ID')
    strain_name = fields.Char('Strain Name')
    unit_thc_content = fields.Float('Unit Thc Content')
    unit_thc_content_uom = fields.Char('Unit Thc Content Unit Of Measure Name')
    unit_volume = fields.Float('Unit Volume')
    unit_volume_uom = fields.Char('Unit Volume Unit Of Measure Name')
    unit_weight = fields.Float('Unit Weight')
    unit_weight_uom = fields.Char('Unit Weight Unit Of Measure Name')
    metrc_synced = fields.Boolean('METRC Synced')

    def sync_with_metrc(self):
        metrc_item = self.env['metrc.sync.item'].sudo().create({
            'product_id': self.id,
        })
        return {
            'name': 'Sync With METRC',
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'metrc.sync.item',
            'res_id': metrc_item.id,
            'target': 'new'
        }
