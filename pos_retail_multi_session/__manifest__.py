# -*- coding: utf-8 -*-
{
    "name": "POS Retail Multi Session",
    "version": '1.0.0.6',
    "category": 'Point of Sale',
    "author": 'TL Technology',
    "price": '600',
    "live_test_url": "http://posodoo.com",
    "website": "http://posodoo.com",
    "sequence": 0,
    "depends": [
        'pos_retail',
    ],
    "data": [
        'views/PosConfig.xml',
    ],
    "qweb": [
        'static/src/xml/*.xml'
    ],
    "currency": 'EUR',
    'images': ['static/description/icon.png'],
    'support': 'thanhchatvn@gmail.com',
    "license": "OPL-1",
    'installable': True,
    'application': True,
    'post_init_hook': 'auto_action_after_install',
}
