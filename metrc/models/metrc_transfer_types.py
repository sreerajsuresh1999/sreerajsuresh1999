from odoo import models, fields


class MetrcTransferTypes(models.Model):
    _name = 'metrc.transfer.type'

    name = fields.Char('Name')
    for_licensed_shipments = fields.Boolean('For Licensed Shipments')
    external_incoming = fields.Boolean('For External Incoming Shipments')
    external_outgoing = fields.Boolean('For External Outgoing Shipments')
    destination_grs_wt = fields.Boolean('Requires Destination Gross Weight')
    packages_grs_wt = fields.Boolean('Requires Packages Gross Weight')
