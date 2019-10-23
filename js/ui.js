/*
  function convertPointFromPageToNode(element, event.pageX, event.pageY) -> {x, y}
  return coordinate in elements local coordinate system (works properly with css transforms without perspective projection)

  function getBoundingClientRectX(element)
  return same result as element.getBoundingClientRect(),
  fixes element.getBoundingClientRect() for Firefox

  see https://bugzilla.mozilla.org/show_bug.cgi?id=591718
*/
(function () {

  function multiply(a, b) {
    var r = [], i, j, k, t;
    for (i = 0; i < a.length; i++) {
      for (j = 0; j < b[0].length; j++) {
        t = 0;
        for (k = 0; k < a[0].length; k++) {
          t += a[i][k] * b[k][j];
        }
        r[i] = r[i] || [];
        r[i][j] = t;
      }
    }
    return r;
  }

  function translate(m/*, tx, ty, tz*/) {
    var i, r = [];
    for (i = 0; i < m.length; i++) {
      r[i] = m[i].slice(0);
      r[i][m[i].length - 1] += +arguments[1 + i] || 0;
    }
    return r;
  }

  function matrixFromCssString(c) {
    c = c.match(/matrix3?d?\(([^\)]+)\)/i)[1].split(',');
    if (c.length === 6) {
      c = [c[0], c[1], 0, 0, c[2], c[3], 0, 0, 0, 0, 1, 0, c[4], c[5], 0, 1];
    }
    var i, j, m = [];
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        m[i] = m[i] || [];
        m[i][j] = parseFloat(c[j * 4 + i]);
      }
    }
    return m;
  }

  function boundingClientRect(element, transformationMatrix) {
    var points = multiply(transformationMatrix, [
      [0, element.offsetWidth, 0, element.offsetWidth],
      [0, 0, element.offsetHeight, 0, element.offsetHeight],
      [0, 0, 0, 0],
      [1, 1, 1, 1]
    ]);

    return {
      left:   Math.min.apply(Math, points[0]),
      top:    Math.min.apply(Math, points[1]),
      right:  Math.max.apply(Math, points[0]),
      bottom: Math.max.apply(Math, points[1])
    };
  }

  var buggy = function () {
    var div = document.createElement('div'), rect, result;
    div.style.cssText = 'width:200px;height:200px;position:fixed;-moz-transform:scale(2);';
    document.body.appendChild(div);
    rect = div.getBoundingClientRect();
    result = !!('\v' !== 'v' && getComputedStyle(div, null).MozTransform && (rect.bottom - rect.top < 300));//!
    div.parentNode.removeChild(div);
    div = null;
    rect = null;

    buggy = function () { return result; };
    return buggy();
  };  

  function getTransformationMatrix(element) {
    var identity = matrixFromCssString('matrix(1,0,0,1,0,0)'),
        transformationMatrix = identity,
        x = element,
        parentRect, rect, t, c, r, origin, computedStyle, inverseOrigin;

    while (x && x !== document.documentElement) {
      computedStyle = window.getComputedStyle ? getComputedStyle(x, null) || {} : {};

      // origin and t matrices required only for Firefox (buggy getBoundingClientRect)
      rect = x.getBoundingClientRect();
      parentRect = x.parentNode && x.parentNode.getBoundingClientRect ? x.parentNode.getBoundingClientRect() : rect;
      t = translate(identity, rect.left - parentRect.left, rect.top - parentRect.top, 0);

      c = (computedStyle.OTransform || computedStyle.WebkitTransform || computedStyle.msTransform ||  computedStyle.MozTransform || 'none').replace(/^none$/, 'matrix(1,0,0,1,0,0)');
      c = matrixFromCssString(c);

      origin = computedStyle.OTransformOrigin || computedStyle.WebkitTransformOrigin || computedStyle.msTransformOrigin || computedStyle.MozTransformOrigin || '';
      // Firefox gives "50% 50%" when there is no transform
      origin = origin.indexOf('%') !== -1 ? '' : origin;
      origin = matrixFromCssString('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,' + ((origin || '0 0') + ' 0').split(' ').slice(0, 3) + ',1)');

      // transformationMatrix = t * origin * c * origin^-1 * transformationMatrix
      inverseOrigin = translate(identity, -origin[0][3], -origin[1][3], -origin[2][3]);
      transformationMatrix = multiply(multiply(multiply(multiply(t, origin), c), inverseOrigin), transformationMatrix);

      x = x.parentNode;
    }

    transformationMatrix = translate(transformationMatrix, -window.pageXOffset, -window.pageYOffset, 0);
    if (!buggy()) {
      r = boundingClientRect(element, transformationMatrix);
      rect = element.getBoundingClientRect(element);
      transformationMatrix = translate(transformationMatrix, rect.left - r.left, rect.top - r.top, 0);
    }
    return transformationMatrix;
  }

  window.convertPointFromPageToNode = function (element, pageX, pageY) {
    /*
        cx = a11 a12 a14   x
        cy = a21 a22 a24   y
         1 =   0   0   1   1
    */
    var a = translate(getTransformationMatrix(element), window.pageXOffset, window.pageYOffset, 0);
    return {
      x: ((pageX - a[0][3]) * a[1][1] - (pageY - a[1][3]) * a[0][1]) / (a[0][0] * a[1][1] - a[0][1] * a[1][0]),
      y: (a[0][0] * (pageY - a[1][3]) - a[1][0] * (pageX - a[0][3])) / (a[0][0] * a[1][1] - a[0][1] * a[1][0])
    };
  };

  window.getBoundingClientRectX = function (element) {
    return buggy() ? boundingClientRect(element, getTransformationMatrix(element)) : element.getBoundingClientRect();
  };

}());

const M = {drag: 0};

window.addEventListener('load', _ => {
    const A = {

        findSuffix(elem, string) {
            let reg = new RegExp(string + "\\S\\w*", "i"),
                res = elem.className.match(reg);

            return !res ? '' : res[0].replace(string, '');
        },

        replace(dom, cl, cl_) {
            dom.classList.remove(cl);
            dom.classList.add(cl_);
        },

        _trk(trk, e) {

            e.stopPropagation();

            if (e.touches)
                e = e.touches[0];

            const prg = trk.querySelector('.prg'),
                thb = trk.querySelector('.thb');


            let offset = 0;

            let scr = trk.parentElement;

            let fixed = new A.fixedBg(trk, prg, thb, scr),
                prev = new A.preview(thb, scr);

            if (e.target === thb) {
                const mouseY = convertPointFromPageToNode(trk, e.pageX, e.pageY).y;

                offset = -mouseY + thb.offsetTop + thb.offsetHeight * 0.5;
            } else {
                drag(e);
            }

            document.addEventListener('mousemove', drag);
            document.addEventListener('touchmove', drag);
            document.addEventListener('mouseup', done);
            document.addEventListener('touchend', done);

            function drag(e) {


                if (e.touches && e.touches.length === 1)
                    e = e.touches[0];

                const mouseY = convertPointFromPageToNode(trk, e.pageX, e.pageY).y;

                v = (mouseY + offset - thb.offsetHeight * 0.5) / (trk.offsetHeight - thb.offsetHeight);

                A.moveThb(prg, v);
                fixed.update();
                prev.update();
            }

            function done() {
                if (e.touches && e.touches.length)
                    return;

                document.removeEventListener('mousemove', drag);
                document.removeEventListener('touchmove', drag);
                document.removeEventListener('mouseup', done);
                document.removeEventListener('touchend', done);

                prev.reset();
                fixed = prev = null;
            }
        },

        moveThb: function(prg, amt) {
            prg.style.flexGrow = amt < 0 ? 0 : amt > 1 ? 1 : amt;
            if (M.drag < 0.5) M.drag += 0.1;
        },

        preview: function(thb, scr) {
            let y = (scr.dataset.s + '').includes('pre') ? thb.offsetTop : undefined;

            this.update = function() {
                if (y !== undefined) scr.style.setProperty('--p', y - thb.offsetTop + 'px');
            }

            this.reset = function() {
                scr.style.setProperty('--p', 0);
            }
        },

        fixedBg: function(trk, prg, thb, scr) {
            let oh, og;

            prg = prg || trk.querySelector('.prg');
            thb = thb || trk.querySelector('.thb');
            scr = scr || trk.parentElement;

            this.update = function() {
                if (oh !== undefined) thb.style.setProperty('--b', og + oh - prg.offsetHeight + 'px');
            }

            if ((scr.dataset.s + '').includes('fixed')) {
                oh = prg.offsetHeight;
                og = parseInt(thb.style.getPropertyValue('--b'));
            }
        },

        _arr(btn) {
            let O = [300, 50, undefined]; //delay, clock, amt

            if (btn.parentElement.dataset.b) {
                let a = btn.parentElement.dataset.b.split(' ');
                for (let i = a.length; i--;) {
                    O[i] = +a[i];
                }
            }

            let f = (d = O[1], firstTime) => {

                if (firstTime || btn.matches(':active')) {
                    A.setScroll(btn, O[2]), A.clock = setTimeout(f, d);
                }

            };

            clearTimeout(A.clock);
            f(O[0], true); //settimeout bug fix firefox
        },

        setScroll(e, amt) {
            let s = e.parentNode.querySelector('.prg'),
                sc = e.parentNode.querySelector('._trk'),
                v = s.style.flexGrow;

            amt = amt ? amt / (sc.getBoundingClientRect().height) : 1 / 15;

            v = +v + amt * (e.classList.contains('top') ? -1 : 1);

            let fixed = new A.fixedBg(sc);

            A.moveThb(s, v);
            fixed.update();

            fixed = '';

        }
    }

    document.addEventListener('touchstart', e => {

        //disable long press (right click ) on mobile
        e.target.oncontextmenu = function(e) {
            this.oncontextmenu = null;
            e.preventDefault();
        }

        if (e.touches.length === 1)
            mouseDown_capture(e);
        
    }, true);

    function mouseDown_capture(e) {
        let c = e.target,
            p, args;

        while (c.parentNode) {

            p = c.className;

            if (typeof p === 'string' && p.startsWith('_')) {
                p = '_' + c.className.split('_')[1].split(' ')[0];

                A[p](c, e);

                break;
            }
            c = c.parentNode;
        }
    }

    document.addEventListener('mousedown', mouseDown_capture, true);
});