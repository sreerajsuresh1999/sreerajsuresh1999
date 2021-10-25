odoo.define('pos_retail_offline.models', function (require) {
    const models = require('point_of_sale.models');
    const utils = require('web.utils');
    const PosHr = require('pos_hr.employees')
    const Floor = require('pos_restaurant.floors')
    const MultiPrint = require('pos_restaurant.multiprint')
    const session = require('web.session');
    const core = require('web.core');
    const _t = core._t;

    const _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        get_model: function (_name) {
            let _index = this.models.map(function (e) {
                return e.model;
            }).indexOf(_name);
            if (_index > -1) {
                return this.models[_index];
            }
            return false;
        },
        get_label: function (_label) {
            let _index = this.models.map(function (e) {
                return e.label;
            }).indexOf(_label);
            if (_index > -1) {
                return this.models[_index];
            }
            return false;
        },
        async automaticUpdatePosSession() {
            let self = this;
            await PosIDB.set('stopCaching', false);
            let session_id = await this.loadServerDataByModel(this.get_model('pos.session'))
            await PosIDB.set('stopCaching', true);
            setTimeout(_.bind(self.automaticUpdatePosSession, self), 10000);
        },

        async loadServerDataByModel(model) {
            let self = this;
            let tmp = {};
            let fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
            let domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
            let context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
            let ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
            let order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
            const loaded = new Promise(function (resolve, reject) {
                let params = {
                    model: model.model,
                    context: _.extend(context, session.user_context || {}),
                };
                if (model.ids) {
                    params.method = 'read';
                    params.args = [ids, fields];
                } else {
                    params.method = 'search_read';
                    params.domain = domain;
                    params.fields = fields;
                    params.orderBy = order;
                }
                self.rpc(params, {
                    timeout: 30000,
                    shadow: true,
                }).then(function (result) {
                    try {    // catching exceptions in model.loaded(...)
                        Promise.resolve(model.loaded(self, result, tmp)).then(function () {
                            resolve(result)
                        }, function (err) {
                            console.error(err)
                            resolve(err)
                        });
                    } catch (err) {
                        console.error(err)
                        resolve(err)
                    }
                }, function (err) {
                    console.error(err)
                    resolve(err)
                });
            });
            return loaded;
        },
        initialize: function (session, attributes) {
            const self = this;
            const companyModel = this.get_model('res.company')
            if (companyModel) {
                companyModel.fields.push('write_date')
            }
            const labelLoading = this.get_label('pictures')
            if (labelLoading) {
                labelLoading.loaded = function (self) {
                    self.company_logo = new Image();
                    return new Promise(function (resolve, reject) {
                        self.company_logo.onload = function () {
                            var img = self.company_logo;
                            var ratio = 1;
                            var targetwidth = 300;
                            var maxheight = 150;
                            if (img.width !== targetwidth) {
                                ratio = targetwidth / img.width;
                            }
                            if (img.height * ratio > maxheight) {
                                ratio = maxheight / img.height;
                            }
                            var width = Math.floor(img.width * ratio);
                            var height = Math.floor(img.height * ratio);
                            var c = document.createElement('canvas');
                            c.width = width;
                            c.height = height;
                            var ctx = c.getContext('2d');
                            ctx.drawImage(self.company_logo, 0, 0, width, height);

                            self.company_logo_base64 = c.toDataURL();
                            resolve();
                        };
                        self.company_logo.onerror = function () {
                            reject();
                        };
                        self.company_logo.crossOrigin = "anonymous";
                        self.company_logo.src = '/web/binary/company_logo' + '?dbname=' + self.session.db + '&company=' + self.company.id + '&write_date=' + self.company.write_date;
                    });
                }
            }
            _super_PosModel.initialize.apply(this, arguments);
        },

        load_server_data: async function () {
            let self = this;
            if (!(await this._allowCaching())) {
                await this._invalidateCaches();
            } else {
                // We keep track of the pos_session_id.
                // If the newly opened pos.session differs from the previously used pos.session,
                // we invalidate the cache. This makes sure that the indexeddb cache is regularly cleared.
                if (await PosIDB.get('pos_session_id') !== odoo.pos_session_id) {
                    await this._invalidateCaches();
                    await PosIDB.set('pos_session_id', odoo.pos_session_id);
                }
            }
            await PosIDB.set('stopCaching', false);
            // We make sure to stop the caching of POST request when server data is loaded.
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                // self.automaticUpdatePosSession()
                PosIDB.set('stopCaching', true)
            })
        },


        _allowCaching: async function () {
            const swRegistration =
                ('serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration('/pos/'))) || false;
            return (
                swRegistration &&
                swRegistration.active &&
                swRegistration.active.state === 'activated'
            );
        },
        /**
         * Clear both the IndexedDB and CacheStorage used in caching.
         */
        _invalidateCaches: async function () {
            await PosIDB.clear();
            try {
                // It is possible that there is no serviceWorker.
                // If that's the case, using `caches` will result to `ReferenceError`.
                await caches.delete('POS-ASSETS');
            } catch (error) {
                console.warn(error);
            }
        },
    })
});
