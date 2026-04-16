import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'dist/tinacms.js');

function replaceOrThrow(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Could not find patch target: ${label}`);
  }
  return source.replace(from, to);
}

const run = async () => {
  let code = await readFile(filePath, 'utf8');

  // 1) Production jsx runtime symbol: rewrite react.transitional.element (React 19) to react.element (React 18 compatible)
  code = replaceOrThrow(
    code,
    'var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");',
    'var REACT_ELEMENT_TYPE = Symbol.for("react.element"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");',
    'production REACT_ELEMENT_TYPE'
  );

  // 2) Development jsx runtime symbol + internals fallback
  code = replaceOrThrow(
    code,
    'var React = require$$0, REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {',
    'var React = require$$0, REACT_ELEMENT_TYPE = Symbol.for(React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ? "react.transitional.element" : "react.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED || null, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {',
    'development REACT_ELEMENT_TYPE + internals fallback'
  );

  // 3) getOwner fallback for React 18
  code = replaceOrThrow(
    code,
    'function getOwner() {\n      var dispatcher = ReactSharedInternals.A;\n      return null === dispatcher ? null : dispatcher.getOwner();\n    }',
    'function getOwner() {\n      var dispatcher = ReactSharedInternals && (ReactSharedInternals.A || ReactSharedInternals.ReactCurrentOwner);\n      if (null == dispatcher)\n        return null;\n      if ("function" === typeof dispatcher.getOwner)\n        return dispatcher.getOwner();\n      return dispatcher.current || null;\n    }',
    'getOwner fallback'
  );

  // 4) recentlyCreatedOwnerStacks fallback for React 18
  code = replaceOrThrow(
    code,
    'var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));\n    var didWarnAboutKeySpread = {};\n    reactJsxRuntime_development.Fragment = REACT_FRAGMENT_TYPE;\n    reactJsxRuntime_development.jsx = function(type, config, maybeKey) {\n      var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;\n',
    'var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));\n    var didWarnAboutKeySpread = {};\n    var recentlyCreatedOwnerStacks = ReactSharedInternals && "number" === typeof ReactSharedInternals.recentlyCreatedOwnerStacks ? ReactSharedInternals.recentlyCreatedOwnerStacks : 0;\n    var getTrackActualOwner = function() {\n      if (ReactSharedInternals && "number" === typeof ReactSharedInternals.recentlyCreatedOwnerStacks)\n        return 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;\n      return 1e4 > recentlyCreatedOwnerStacks++;\n    };\n    reactJsxRuntime_development.Fragment = REACT_FRAGMENT_TYPE;\n    reactJsxRuntime_development.jsx = function(type, config, maybeKey) {\n      var trackActualOwner = getTrackActualOwner();\n',
    'recentlyCreatedOwnerStacks fallback block'
  );

  code = replaceOrThrow(
    code,
    'reactJsxRuntime_development.jsxs = function(type, config, maybeKey) {\n      var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;\n',
    'reactJsxRuntime_development.jsxs = function(type, config, maybeKey) {\n      var trackActualOwner = getTrackActualOwner();\n',
    'jsxs trackActualOwner fallback'
  );

  await writeFile(filePath, code, 'utf8');
  console.log('Applied React 18 compatibility patch to dist/tinacms.js');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
