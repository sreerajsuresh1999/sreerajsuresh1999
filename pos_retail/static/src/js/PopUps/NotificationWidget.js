odoo.define('pos_retail.NotificationWidget', function (require) {
    'use strict';

    const {useListener} = require('web.custom_hooks');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const {posbus} = require('point_of_sale.utils');

    const icon_mapping = {
        success: "fa fa-thumbs-up",
        danger: "fa fa-exclamation-triangle",
        warning: "fa fa-exclamation",
        info: "fa fa-info",
        default: "fa fa-lightbulb-o",
    }

    class NotificationWidget extends PosComponent {
        constructor() {
            super(...arguments)
            useListener('click', this.closeNotificationWidget);
            this.state = useState({
                isShow: false,
                title: '',
                icon: 'fa fa-lightbulb-o'
            });
        }

        mounted() {
            super.mounted()
            posbus.on('open-notification', this, this.openNotification);
            posbus.on('close-notification', this, this.closeNotificationWidget);
        }

        closeNotificationWidget() {
            this.state.isShow = false
            this.state.title = ''
            this.state.message = ''
        }

        openNotification(detail) {
            const self = this
            this.state.isShow = true
            this.state.title = detail.title
            this.state.message = detail.message
            if (!detail.duration) {
                detail.duration = 2000
            }
            setTimeout(() => {
                self.closeNotificationWidget();
            }, detail.duration)
        }
    }

    NotificationWidget.template = 'NotificationWidget';

    Registries.Component.add(NotificationWidget);

    return NotificationWidget;
});
