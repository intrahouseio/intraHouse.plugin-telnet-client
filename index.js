const Telnet = require('./lib/util-telnet');
const Plugin = require('./lib/plugin');

const plugin = new Plugin();

const STORE = {
  sessions: {},
};

function createFunction(value) {
  try {
    return new Function('data', `return ${value}`);
  } catch (e) {
    return e.message;
  }
}

function prepareChildren(value) {
  switch (value.parseType) {
    case 'json':
      return ({
        ...value,
        parse: createFunction(value.json),
      });
    case 'text':
      return ({
        ...value,
        parse: value.regexp !== '' ? new RegExp(value.regexp, value.flag) : null,
      });
    case 'search':
      return ({
        ...value,
        parse: value.regexp !== '' ? new RegExp(value.regexptest, value.flag) : null,
      });
    default:
      return value;
  }
  return value;
}

function prepareParent(value) {
  if (value.host !== undefined) {
    value.url = value.host + ':' + value.port;
    return value;
  }
  return value;
}

function prepareTasks(data) {
  const parent = []
  const children = {}

  data
    .forEach(i => {
      if (i.parentid === undefined || i.parentid === false) {
        parent.push(prepareParent(i));
      } else {
        if (children[i.parentid] === undefined) {
          children[i.parentid] = [];
        }
        children[i.parentid].push(prepareChildren(i));
      }
    });

  return parent.map(i => ({ ...i, values: children[i.id] || [] }));
}

function prepareActions(data) {
  const actions = {};
  data
    .forEach((r, key) => {
      r.values.forEach(c => {
        if (c.actions) {
          actions[c.dn] = {};
            c.actions.forEach(a => {
              a.task = key;
              actions[c.dn][a.act] = prepareParent(a);
            });
        }
      });
    });
  return actions;
}

function req(params) {
  return new Promise((resolve, reject) => {

      const config = {
          host: params.host,
          port: params.port,
          username: params.username,
          password: params.password,
          enpassword: '',
          log: false,
      }

      let seq = 0;
      let res = 0;
      let err = 0;
      const temp = [];

      const timer = setTimeout(() => {
        reject(Error('timeout'));
      }, params.interval ? (params.interval * 1000) - 100 : 12000);


      const c = new Telnet();

      c.connect(config);

      c.on('data', function (data) {
          seq = seq + 1;

          if (seq === 6) {
            c.write(Buffer.from('1b5b3f36323b631b5b35333b3352', 'hex'));
            c.write(Buffer.from('1b5b35333b3152', 'hex'));
            c.write(Buffer.from('1b5b313b3152', 'hex'));
            c.write(Buffer.from('1b5b313b32303752', 'hex'));
            c.write(Buffer.from('1b5b313b3352', 'hex'));
            c.write(Buffer.from('1b5b313b323037521b5b313b323037521b5b323b3252', 'hex'));
            c.write(Buffer.from('1b5b313b31521b5b353b31521b5b353b3152', 'hex'));
          }

          if (res > 0) {
            temp.push(data.toString());
          }

          if (res === 2 & data.toString().indexOf(">") > -1) {
            res = 3;
            err = 1;
            c.write('exit\r\nquit\r\n');
            clearTimeout(timer);
             plugin.debug(params.host + ' res:\r\n' + temp.join('\r\n'), 1);
            resolve(temp.join('\r\n'));
          }

          if (res === 1 & data.toString().indexOf(">") > -1) {
            res = 2;
          }

          if (res === 0 & data.toString().indexOf(">") > -1) {
            res = 1;
            c.write(params.command + '\r\n');
          }
      });
      c.on('connect', function () {
      });

      c.on('error', function (error) {
          if (err === 0) {
            clearTimeout(timer);
            reject(error);
          }
          err = 1;
      });
      c.on('timeout', function () {
          if (err === 0) {
            clearTimeout(timer);
            reject(Error('timeout'));
          }
          err = 1;
      });
      c.on('close', function (had_error) {
          if (err === 0) {
            clearTimeout(timer);
            reject(Error('close'));
          }
          err = 1;
      });
      c.on('end', function () {
          if (err === 0) {
            clearTimeout(timer);
            reject(Error('end'));
          }
          err = 1;
      });
  });
}

function parser(text, values, url) {
  return values
    .map(value => {
      switch (value.parseType) {
        case 'json':
          return parserJSON(text, value, url);
        case 'text':
          return parserREGEXP(text, value, url);
        case 'search':
           return parserREGEXPTEST(text, value, url);
        default:
          return {};
      }
    })
    .filter(i => i.dn !== null);
}

function parserJSON(text, item, url) {
  try {
    if (typeof item.parse !== 'function') {
      return { dn: item.dn, err: item.parse };
    }
    const data = JSON.parse(text);
    const value = item.number ? Number(item.parse(data)) : item.parse(data);
    if (item.number && isNaN(value)) {
      return { dn: item.dn, err: 'Value is NaN!' };
    } else {
      return { dn: item.dn, value };
    }
  } catch (e) {
    return { dn: item.dn, err: e.message };
  }
}

function parserREGEXP(text, item, url) {
  try {
    if (item.parse === null) {
      const value = item.number ? Number(text) : text;
      if (item.number && isNaN(value)) {
        return { dn: item.dn, err: 'Value is NaN!' };
      } else {
        return { dn: item.dn, value };
      }
    } else {
      const regex = item.parse;
      const values = regex.exec(text);
      plugin.debug(`${url} --> values: ${JSON.stringify(values.slice(-2))}`, 1)
      const value = item.number ? Number(values[item.rescount]) : values[item.rescount];
      regex.exec('');
      if (item.number && isNaN(value)) {
        return { dn: item.dn, err: 'Value is NaN!' };
      } else {
        return { dn: item.dn, value };
      }
    }
  } catch (e) {
    return { dn: item.dn, err: e.message };
  }
}

function parserREGEXPTEST(text, item, url) {
  try {
      const regex = item.parse;
      const test = regex.test(text);
      regex.test('');
      plugin.debug(`${url} --> value: ${test}`, 1)
      if (test) {
        return { dn: item.dn, value: item.number ? Number(item.valueTrue) : item.valueTrue };
      } else {
        if (item.valueFalse !== 'null') {
          return { dn: item.dn, value: item.number ? Number(item.valueFalse) : item.valueFalse };
        } else {
          return { dn: null };
        }
      }
  } catch (e) {
    return { dn: item.dn, err: e.message };
  }
}

function task() {
  req(this)
    .then(res => parser(res, this.values, this.url))
    .then(values => {
      if (values.length) {
        plugin.setDeviceValue(values);
      }
    })
    .catch(e => plugin.setDeviceValue(this.values.map(item => ({ dn: item.dn, err: e.message }))));
}

function worker(item) {
  const _task = task.bind(item);
  setInterval(_task, item.interval * 1000);
  _task();
}

plugin.on('device_action', (device) => {
  if (STORE.actions[device.dn] && STORE.actions[device.dn][device.prop]) {
    const action = STORE.actions[device.dn][device.prop];
    if (device.prop === 'set') {
      action.url = action.url.replace(/\${value}/gim, device.val);
    }
    req(action)
      .then(res => {
        if (action.updatestate) {
          task.bind(STORE.tasks[action.task]).call();
        } else {
          if (device.prop === 'set') {
            plugin.setDeviceValue([{ dn: device.dn, value: device.val }]);
          } else {
            plugin.setDeviceValue([{ dn: device.dn, value: device.prop === 'on' ? 1 : 0 }]);
          }
        }
      })
      .catch(e => plugin.setDeviceValue([{ dn: device.dn, err: e.message }]));
  }
});

plugin.on('start', () => {
  STORE.tasks = prepareTasks(plugin.channels);
  STORE.actions = prepareActions(STORE.tasks);
  STORE.tasks.forEach(worker);
});
