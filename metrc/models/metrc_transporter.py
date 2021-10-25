from odoo import models, fields


class MetrcTransporters(models.Model):
    _name = 'metrc.transporter'

    partner_id = fields.Many2one('res.partner', string='Partner')
    occ_license_num = fields.Char('Driver Occupational License Number')
    driver_name = fields.Char('Driver Name')
    license_num = fields.Char('Driver License Number')
    phone = fields.Char('Phone Number For Questions')
    vehicle_make = fields.Char('Vehicle Make')
    vehicle_model = fields.Char('Vehicle Model')
    vehicle_number = fields.Char('Vehicle License Plate Number')
    is_layover = fields.Boolean('Is Layover')
    est_departure = fields.Datetime('Estimated Departure Date Time')
    est_arrival = fields.Datetime('Estimated Arrival Date Time')
    picking_id = fields.Many2one('stock.picking', string='Picking ID')
