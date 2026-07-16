var e=/highlight-(?:text|source)-([a-z0-9]+)/;function t(t){t.addRule(`highlightedCodeBlock`,{filter:function(t){var n=t.firstChild;return t.nodeName===`DIV`&&e.test(t.className)&&n&&n.nodeName===`PRE`},replacement:function(t,n,r){var i=((n.className||``).match(e)||[null,``])[1];return`

`+r.fence+i+`
`+n.firstChild.textContent+`
`+r.fence+`

`}})}function n(e){e.addRule(`strikethrough`,{filter:[`del`,`s`,`strike`],replacement:function(e){return`~`+e+`~`}})}var r=Array.prototype.indexOf,i=Array.prototype.every,a={};a.tableCell={filter:[`th`,`td`],replacement:function(e,t){return c(e,t)}},a.tableRow={filter:`tr`,replacement:function(e,t){var n=``,r={left:`:--`,right:`--:`,center:`:-:`};if(o(t))for(var i=0;i<t.childNodes.length;i++){var a=`---`,s=(t.childNodes[i].getAttribute(`align`)||``).toLowerCase();s&&(a=r[s]||a),n+=c(a,t.childNodes[i])}return`
`+e+(n?`
`+n:``)}},a.table={filter:function(e){return e.nodeName===`TABLE`&&o(e.rows[0])},replacement:function(e){return e=e.replace(`

`,`
`),`

`+e+`

`}},a.tableSection={filter:[`thead`,`tbody`,`tfoot`],replacement:function(e){return e}};function o(e){var t=e.parentNode;return t.nodeName===`THEAD`||t.firstChild===e&&(t.nodeName===`TABLE`||s(t))&&i.call(e.childNodes,function(e){return e.nodeName===`TH`})}function s(e){var t=e.previousSibling;return e.nodeName===`TBODY`&&(!t||t.nodeName===`THEAD`&&/^\s*$/i.test(t.textContent))}function c(e,t){var n=r.call(t.parentNode.childNodes,t),i=` `;return n===0&&(i=`| `),i+e+` |`}function l(e){for(var t in e.keep(function(e){return e.nodeName===`TABLE`&&!o(e.rows[0])}),a)e.addRule(t,a[t])}function u(e){e.addRule(`taskListItems`,{filter:function(e){return e.type===`checkbox`&&e.parentNode.nodeName===`LI`},replacement:function(e,t){return(t.checked?`[x]`:`[ ]`)+` `}})}function d(e){e.use([t,n,l,u])}export{d as gfm,t as highlightedCodeBlock,n as strikethrough,l as tables,u as taskListItems};