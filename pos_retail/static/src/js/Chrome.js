odoo.define('pos_retail.Chrome', function (require) {
    'use strict';

    const Chrome = require('point_of_sale.Chrome');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const QWeb = core.qweb;
    const field_utils = require('web.field_utils');
    const {posbus} = require('point_of_sale.utils');
    const {useState} = owl.hooks;
    const Session = require('web.Session');
    const framework = require('web.framework');
    require("bus.BusService");
    const bus = require('pos_retail.core_bus');

    const RetailChrome = (Chrome) =>
        class extends Chrome {
            constructor() {
                super(...arguments)
                this.webClient = arguments[1]['webClient']
                this.state = useState({
                    uiState: 'LOADING', // 'LOADING' | 'READY' | 'CLOSING'
                    debugWidgetIsShown: true,
                    hasBigScrollBars: false,
                    sound: {src: null},
                })
            }

            startPolling() {
                this.bus = bus.bus
                this.bus.last = 0
                this.bus.on("notification", this, this.busNotification);
                this.bus.start_polling();
            }

            busNotification(notifications) {
                const self = this;
                notifications.forEach(notification => {
                    let channel = notification[0][1]
                    let message = notification[1]
                    console.warn('channel  ' + channel)
                    console.warn(message)
                    if (channel == 'pos.session.login') {
                        let datas = JSON.parse(message)
                        if (datas['pos_config_id'] == parseInt(self.env.session.config_id) && datas['last_login_time'] != odoo.session_info['last_login_time']) {
                            return self._autoCloseIfAnotherBrowseTabOpenPOS()
                        }
                    }
                })
            }

            showNotification(title = 'Alert', message, duration = 3000) {
                const self = this;
                posbus.trigger('open-notification', {
                    title: title,
                    message: message,
                    duration: duration
                })
            }

            _lockedUi(message) {
                this.state.uiState = 'LOCKED';
                this.loading.message = message;
                this.setLoadingMessage(message);
            }

            _unlockUi() {
                this.state.uiState = 'READY';
                this.loading.message = '';
            }

            get startScreen() {
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.screen_type == 'kitchen') {
                    return {name: 'KitchenScreen', props: {}};
                } else {
                    return super.startScreen;
                }
            }

            resizeImageToDataUrl(img, maxwidth, maxheight, callback) {
                img.onload = function () {
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    var ratio = 1;

                    if (img.width > maxwidth) {
                        ratio = maxwidth / img.width;
                    }
                    if (img.height * ratio > maxheight) {
                        ratio = maxheight / img.height;
                    }
                    var width = Math.floor(img.width * ratio);
                    var height = Math.floor(img.height * ratio);

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    var dataurl = canvas.toDataURL();
                    callback(dataurl);
                };
            }

            async loadImageFile(file, callback) {
                var self = this;
                if (!file) {
                    return;
                }
                if (file.type && !file.type.match(/image.*/)) {
                    return this.env.pos.alert_message({
                        title: 'Error',
                        body: 'Unsupported File Format, Only web-compatible Image formats such as .png or .jpeg are supported',
                    });
                }
                var reader = new FileReader();
                reader.onload = function (event) {
                    var dataurl = event.target.result;
                    var img = new Image();
                    img.src = dataurl;
                    self.resizeImageToDataUrl(img, 600, 400, callback);
                };
                reader.onerror = function () {
                    return self.this.env.pos.alert_message({
                        title: 'Error',
                        body: 'Could Not Read Image, The provided file could not be read due to an unknown error',
                    });
                };
                await reader.readAsDataURL(file);
            }

            mounted() {
                super.mounted()

            }

            willUnmount() {
                super.willUnmount()
            }

            _setIdleTimer() {
                // todo: odoo LISTEN EVENTS 'mousemove mousedown touchstart touchend touchmove click scroll keypress'
                // IF HAVE NOT EVENTS AUTO BACK TO FLOOR SCREEN
                return; // KIMANH
            }

            async start() {
                window.chrome = this
                this.appendLogo()
                await super.start()
                this.env.pos.chrome = this
                // this.closeOtherTabs()
                if (this.env.pos.config.restaurant_order || this.env.pos.session.restaurant_order) this.showTempScreen('RegisterScreen')
                if (this.env.pos.config.checkin_screen) this.showTempScreen('CheckInScreen')
                if (!odoo.session_info['config']['allow_duplicate_session']) this.startPolling()
            }

            appendLogo() {
                let link = document.querySelector("link[rel~='shortcut']");
                link = document.createElement('link');
                link.rel = 'icon';
                document.getElementsByTagName('head')[0].appendChild(link);
                link.href = '/pos_retail/static/description/icon.ico';
                document.title = 'TL Technology POS'
            }

            _closeOtherTabs() {
                if (odoo.session_info['config']['allow_duplicate_session']) {
                    return super._closeOtherTabs()
                }
            }

            // closeOtherTabs() { // TODO: 1 browse only allow 1 pos session online
            //     const self = this;
            //     const now = Date.now();
            //     let link = document.querySelector("link[rel~='shortcut']");
            //     link = document.createElement('link');
            //     link.rel = 'icon';
            //     document.getElementsByTagName('head')[0].appendChild(link);
            //     link.href = '/pos_retail/static/description/icon.ico';
            //     document.title = this.env.pos.config.pos_title
            //     localStorage['message'] = '';
            //     localStorage['message'] = JSON.stringify({
            //         'message': 'close_tabs',
            //         'config': this.env.pos.config.id,
            //         'window_uid': now,
            //     });
            //     window.addEventListener("storage", function (event) {
            //         const msg = event.data;
            //         if (event.key === 'message' && event.newValue) {
            //             const msg = JSON.parse(event.newValue);
            //             if (msg.message === 'close_tabs' &&
            //                 msg.config == self.env.pos.config.id &&
            //                 msg.window_uid != now) {
            //                 setTimeout(() => {
            //                     self._autoCloseIfAnotherBrowseTabOpenPOS()
            //                 }, 1000)
            //
            //             }
            //         }
            //
            //     }, false);
            // }

            async _autoCloseIfAnotherBrowseTabOpenPOS() {
                setTimeout(() => {
                    window.location = '/web#action=point_of_sale.action_client_pos_menu'
                }, 10000)
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning, We will close POS now'),
                    body: this.env._t('Your POS opened by another person at another Place (new tab or another browse or another device)'),
                    disableCancelButton: true,
                })
                window.location = '/web#action=point_of_sale.action_client_pos_menu'

            }

            async _showStartScreen() {
                // when start screen, we need loading to KitchenScreen for listen event sync from another sessions
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.kitchen_screen) {
                    await this.showScreen('KitchenScreen')
                }
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.qrcode_order_screen) {
                    await this.showScreen('QrCodeOrderScreen')
                }
                super._showStartScreen()
            }

            async openApplication() {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: 'Welcome to POS Retail. 1st POS Solution of Odoo',
                    body: 'Copyright (c) 2014-2020 of TL TECHNOLOGY \n' +
                        '  Email: thanhchatvn@gmail.com \n' +
                        '  Skype: thanhchatvn',
                    disableCancelButton: true,
                })
                if (confirmed) {
                    window.open('https://join.skype.com/invite/j2NiwpI0OFND', '_blank')
                }
            }

            async __showScreen({detail: {name, props = {}}}) {
                console.log('[__showScreen]: ' + name)
                // if (this.env.pos.config.screen_type == 'kitchen' && this.env.pos.config.sync_multi_session && name != "KitchenScreen") {
                //     name = "KitchenScreen" // always keep on KitChen Screen if Kitchen Room
                // }
                super.__showScreen({detail: {name, props}})
                // if (this.env.pos.config.big_datas_sync_realtime) { // todo: if bus.bus not active, when change screen we auto trigger update with backend
                //     this.env.pos.trigger('backend.request.pos.sync.datas');
                // }
                if (name == 'ProductScreen') {
                    posbus.trigger('reset-screen')
                }
            }

            async showAppInformation() {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: 'Thanks for choice POS Retail. 1st POS Solution of Odoo',
                    body: 'Copyright (c) 2014-2020 of TL TECHNOLOGY \n' +
                        '  Email: thanhchatvn@gmail.com \n' +
                        '  Skype: thanhchatvn \n' +
                        'If you need support direct us, Please click OK button and direct message via Skype',
                    disableCancelButton: true,
                })
                if (confirmed) {
                    window.open('https://join.skype.com/invite/j2NiwpI0OFND', '_blank')
                }
            }

            async closingSession() {
                framework.blockUI()
                const closingSession = await this.rpc({
                    model: 'pos.session',
                    method: 'force_action_pos_session_close',
                    args: [[this.env.pos.pos_session.id]]
                })
                framework.unblockUI()
                return closingSession
            }

            __closePopup() {
                super.__closePopup()
                posbus.trigger('closed-popup') // i need add this event for listen event closed popup and add event keyboard back product screen
            }

            async _setClosingCash() {
                let sessions = await this.rpc({
                    model: 'pos.session',
                    method: 'search_read',
                    args: [[['id', '=', this.env.pos.pos_session.id]]]
                })
                if (sessions.length) {
                    const sessionSelected = sessions[0]
                    let startedAt = field_utils.parse.datetime(sessionSelected.start_at);
                    sessionSelected.start_at = field_utils.format.datetime(startedAt);
                    let {confirmed, payload: values} = await this.showPopup('CashSession', {
                        title: this.env._t('Management Cash Control your Session'),
                        session: sessionSelected
                    })
                    if (confirmed) {
                        let action = values.action;
                        if ((action == 'putMoneyIn' || action == 'takeMoneyOut') && values.value.amount != 0) {
                            await this.rpc({
                                model: 'cash.box.out',
                                method: 'cash_input_from_pos',
                                args: [0, values.value],
                            })
                            this._setClosingCash();
                        }
                        if (action == 'setClosingBalance' && values.value.length > 0) {
                            await this.rpc({
                                model: 'account.bank.statement.cashbox',
                                method: 'validate_from_ui',
                                args: [0, this.env.pos.pos_session.id, 'end', values.value],
                            })
                            await this._setClosingCash();
                        }
                    }
                }
            }

            _preloadImages() { // stop loading all image background
                // this.env.pos.getImageProducts()
                return true
            }

            async _closePos() {
                let ordersUnpaid = this.env.pos.db.get_unpaid_orders()
                const iot_url = this.env.pos.session.origin;
                const connection = new Session(void 0, iot_url, {
                    use_cors: true
                });
                const pingServer = await connection.rpc('/pos/passing/login', {}).then(function (result) {
                    return result
                }, function (error) {
                    return false;
                })
                if (!pingServer) {
                    await this.showPopup('OfflineErrorPopup', {
                        title: this.env._t('Offline'),
                        body: this.env._t('Your Internet or Odoo Server Offline. If you close a POS, could not open back'),
                    });
                    return true;
                }
                const self = this;
                let lists = [
                    {
                        name: this.env._t('Only Close your POS Session'),
                        item: 0,
                        id: 0,
                    },
                    {
                        name: this.env._t('Logout System'),
                        item: 2,
                        id: 2,
                    },
                ]
                if (this.env.pos.user && this.env.pos.config.allow_closing_session) {
                    lists.push({
                        name: this.env._t('Logout POS Session and auto Closing Posting Entries Current Session'),
                        item: 1,
                        id: 1,
                    })
                    lists.push({
                        name: this.env._t('Logout POS Session, auto Closing Posting Entries current Session and Logout System'),
                        item: 3,
                        id: 3,
                    })
                    lists.push({
                        name: this.env._t('Closing Posting Entries current Session and Print Z-Report'),
                        item: 4,
                        id: 4,
                    })
                }
                if (this.env.pos.config.cash_control && this.env.pos.config.management_session) {
                    lists.push({
                        name: this.env._t('Set Closing Cash'),
                        item: 5,
                        id: 5,
                    })
                }
                let title = this.env._t('Select 1 Close Type. ')
                if (ordersUnpaid.length > 0) {
                    title = title + ordersUnpaid.length + this.env._t(' unpaid Orders, have some draft unpaid orders. You can exit temporarily the Point of Sale, but you will loose that orders if you close the session')
                }
                let {confirmed, payload: selectedCloseTypes} = await this.showPopup(
                    'PopUpSelectionBox',
                    {
                        title: title,
                        items: lists,
                        onlySelectOne: true,
                    }
                );
                if (confirmed && selectedCloseTypes['items'] && selectedCloseTypes['items'].length == 1) {
                    const typeId = selectedCloseTypes['items'][0]['id']
                    if (typeId == 0) {
                        return super._closePos()
                    }
                    if (typeId == 1) {
                        await this.closingSession()
                        super._closePos()
                        window.location = '/web?#id=' + this.env.pos.pos_session.id + '&model=pos.session&view_type=form'
                    }
                    if (typeId == 2) {
                        return window.location = '/web/session/logout';
                    }
                    if (typeId == 3) {
                        await this.closingSession()
                        return window.location = '/web/session/logout';
                    }
                    if (typeId == 4) {
                        await this.closingSession()
                        let params = {
                            model: 'pos.session',
                            method: 'build_sessions_report',
                            args: [[this.env.pos.pos_session.id]],
                        };
                        let values = await this.rpc(params, {shadow: true}).then(function (values) {
                            return values
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        })
                        let reportData = values[this.env.pos.pos_session.id];
                        let start_at = field_utils.parse.datetime(reportData.session.start_at);
                        start_at = field_utils.format.datetime(start_at);
                        reportData['start_at'] = start_at;
                        if (reportData['stop_at']) {
                            var stop_at = field_utils.parse.datetime(reportData.session.stop_at);
                            stop_at = field_utils.format.datetime(stop_at);
                            reportData['stop_at'] = stop_at;
                        }
                        let reportHtml = QWeb.render('ReportSalesSummarySession', {
                            pos: this.env.pos,
                            report: reportData,
                        })
                        this.showScreen('ReportScreen', {
                            report_html: reportHtml,
                            closeScreen: true
                        })
                    }
                    if (typeId == 5) {
                        await this._setClosingCash()
                    }
                }
            }
        }
    Registries.Component.extend(Chrome, RetailChrome);

    return RetailChrome;
});
