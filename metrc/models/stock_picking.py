from odoo import models, fields


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    do_metrc_synced = fields.Boolean('METRC Synced', default=False)
    metrc_sync = fields.Boolean('Sync with METRC if necessary', default=True)

    shipper_facility = fields.Many2one('metrc.facility', string='Shipper Facility')
    receiver_facility = fields.Many2one('metrc.facility', string='Receiver Facility')
    distributor_facility = fields.Many2one('metrc.facility', string='Distributor Facility')
    driver_id = fields.Many2one('res.partner', string='Driver')
    vehicle_make = fields.Char('Vehicle Make')
    vehicle_model = fields.Char('Vehicle Model')
    vehicle_license = fields.Char('Vehicle License Plate Number')

    def print_shipping_manifest(self):
        return self.env.ref('metrc.report_shipping_manifest').report_action(self)

    def button_validate(self):
        res = super(StockPicking, self).button_validate()
        if self.metrc_sync:
            if self.picking_type_code == 'internal':
                metrc_account = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1)
                license = self.picking_type_id.warehouse_id.facility_id.license_number
                src_is_wh = self.location_id.complete_name.split("/")[-1] == 'Stock'
                dest_is_wh = self.location_dest_id.complete_name.split("/")[-1] == 'Stock'
                active = True
                if src_is_wh and dest_is_wh:
                    # active = metrc_account.sync_w2w_internal_transfer(self, license)
                    pass
                else:
                    active = metrc_account.sync_internal_transfer(self, license)
                if active:
                    pass
                else:
                    return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please create and activate '
                                                                                           'a METRC account.')
        return res
