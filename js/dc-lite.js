/*
  dc-lite.js
  A tiny stand-in for the Claude canvas runtime, so the pages work on any static host
  (GitHub Pages, Netlify, your own server).

  It does one job: render the loading screen from <template id="loader-tpl"> into
  <div id="loader">, filling in {{values}} and repeating <sc-for> blocks, and update
  it every time the page's Component calls setState().
*/
(function () {
  function lookup(scope, path) {
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return '';
      v = v[parts[i]];
    }
    return v == null ? '' : v;
  }

  function fill(str, scope) {
    return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, p) { return String(lookup(scope, p)); });
  }

  // Walk a cloned template node, expanding <sc-for> and filling {{holes}}.
  function process(node, scope) {
    if (node.nodeType === 3) {
      if (node.nodeValue.indexOf('{{') !== -1) node.nodeValue = fill(node.nodeValue, scope);
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;

    if (node.nodeType === 1) {
      for (var a = 0; a < node.attributes.length; a++) {
        var attr = node.attributes[a];
        if (attr.value.indexOf('{{') !== -1) attr.value = fill(attr.value, scope);
      }
    }

    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (child) {
      if (child.nodeType === 1 && child.tagName.toLowerCase() === 'sc-for') {
        var listPath = (child.getAttribute('list') || '').replace(/[{}\s]/g, '');
        var as = child.getAttribute('as') || 'item';
        var list = lookup(scope, listPath) || [];
        var frag = document.createDocumentFragment();
        list.forEach(function (item, i) {
          var inner = Object.create(scope);
          inner[as] = item;
          inner.index = i;
          Array.prototype.forEach.call(child.childNodes, function (c) {
            var copy = c.cloneNode(true);
            process(copy, inner);
            frag.appendChild(copy);
          });
        });
        node.replaceChild(frag, child);
      } else {
        process(child, scope);
      }
    });
  }

  // Copy changes from a freshly rendered tree onto the live one, so CSS transitions keep playing.
  function morph(live, next) {
    if (live.nodeType !== next.nodeType || live.nodeName !== next.nodeName) {
      live.parentNode.replaceChild(next, live);
      return;
    }
    if (live.nodeType === 3) {
      if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue;
      return;
    }
    if (live.nodeType === 1) {
      Array.prototype.forEach.call(next.attributes, function (attr) {
        if (live.getAttribute(attr.name) !== attr.value) live.setAttribute(attr.name, attr.value);
      });
      Array.prototype.slice.call(live.attributes).forEach(function (attr) {
        if (!next.hasAttribute(attr.name)) live.removeAttribute(attr.name);
      });
    }
    morphChildren(live, next);
  }

  function morphChildren(live, next) {
    var a = live.childNodes, b = Array.prototype.slice.call(next.childNodes);
    if (a.length !== b.length) {
      while (live.firstChild) live.removeChild(live.firstChild);
      b.forEach(function (n) { live.appendChild(n); });
      return;
    }
    for (var i = 0; i < b.length; i++) morph(a[i], b[i]);
  }

  window.DCLogic = function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  };
  window.DCLogic.prototype.setState = function (patch) {
    for (var k in patch) this.state[k] = patch[k];
    if (this._render) this._render();
  };

  window.DCLite = {
    mount: function (ComponentClass, props) {
      var tpl = document.getElementById('loader-tpl');
      var host = document.getElementById('loader');
      var comp = new ComponentClass(props);
      comp.props = props || {};
      comp.state = comp.state || {};

      comp._render = function () {
        var vals = comp.renderVals();
        if (!vals.showLoader) {
          while (host.firstChild) host.removeChild(host.firstChild);
          return;
        }
        var wrap = document.createElement('div');
        wrap.appendChild(tpl.content.cloneNode(true));
        process(wrap, vals);
        if (!host.firstChild) {
          while (wrap.firstChild) host.appendChild(wrap.firstChild);
        } else {
          morphChildren(host, wrap);
        }
      };

      comp._render();
      if (comp.componentDidMount) comp.componentDidMount();
      return comp;
    }
  };
})();
