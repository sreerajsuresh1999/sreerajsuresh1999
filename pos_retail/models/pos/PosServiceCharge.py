# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from odoo.exceptions import UserError

import requests
import logging

_logger = logging.getLogger(__name__)


class PosServiceCharge(models.Model):
    _name = "pos.service.charge"
    _description = "Management Service Charge"

    name = fields.Char('Name', required=1)
    product_id = fields.Many2one(
        'product.product',
        string='Service Charge',
        domain=[('available_in_pos', '=', True)],
        required=1
    )
    type = fields.Selection([
        ('percent', 'Percent'),
        ('fixed', 'Fixed')
    ],
        string='Service Charge Type',
        default='percent',
        required=1
    )
    amount = fields.Float(
        'Service Charge Amount Or %',
        required=1
    )
    distance_from = fields.Float('Distance from (km)')
    distance_to = fields.Float('Distance to (km)')

    def get_service_shipping_distance(self, partner_id, stock_location_id):
        geo_obj = self.env['base.geocoder']
        location = self.env['stock.location'].browse(stock_location_id)
        if not location.location_address_id:
            return None
        else:
            apikey = self.env['ir.config_parameter'].sudo().get_param('base_geolocalize.google_map_api_key')
            if not apikey:
                raise UserError(_(
                    "API key for GeoCoding (Places) required.\n"
                    "Visit https://developers.google.com/maps/documentation/geocoding/get-api-key for more information."
                ))
            to_address = self.env['res.partner'].browse(partner_id)
            from_address = location.location_address_id
        from_address = geo_obj.geo_query_address(
            from_address.street,
            from_address.zip,
            from_address.city,
            from_address.state_id.name if from_address.state_id else '',
            from_address.country_id.name if from_address.country_id else ''
        )
        to_address = geo_obj.geo_query_address(
            to_address.street,
            to_address.zip,
            to_address.city,
            to_address.state_id.name if to_address.state_id else '',
            to_address.country_id.name if to_address.country_id else ''
        )
        google_map_link = "https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&"
        google_map_link += "origins=" + from_address + "&"
        google_map_link += "destinations=" + to_address + "&"
        google_map_link += "key=" + apikey
        _logger.info('{PosServiceCharge.py} google_map_link %s' % google_map_link)
        try:
            result = requests.get(google_map_link,
                                  {}).json()
        except Exception as e:
            raise UserError(_('Error with geolocation server:') + ' %s' % e)
        distance = None
        duration = None
        if result and result.get('rows', None) and result.get('rows')[0] and result.get('rows')[0].get('elements') and \
                result.get('rows')[0].get('elements')[0].get('distance'):
            distance = result.get('rows')[0].get('elements')[0].get('distance')
            duration = result.get('rows')[0].get('elements')[0].get('duration')
        _logger.info('{PosServiceCharge.py} distance %s' % distance)
        if distance:
            distance_value = distance['value'] * 1.609344 / 1000
            service = None
            services = self.search([
                '|',
                ('distance_to', '!=', None),
                ('distance_from', '<=', None),
            ])
            last_distance = 0
            for se in services:
                if not last_distance:
                    service = se
                    last_distance = se.distance_to
                else:
                    if se.distance_to <= distance_value and last_distance <= se.distance_to:
                        service = se
                        last_distance = se.distance_to
            return {
                'from_address': from_address,
                'to_address': to_address,
                'distance_value': distance_value,
                'service_id': service.id if service else None,
                'distance': distance,
                'duration': duration
            }
        else:
            return None
