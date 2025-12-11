const optionalMicroserviceModules = {
  mqtt: 'commonjs mqtt',
  nats: 'commonjs nats',
  amqplib: 'commonjs amqplib',
  'amqp-connection-manager': 'commonjs amqp-connection-manager',
  kafkajs: 'commonjs kafkajs',
};

module.exports = (options) => {
  const existingExternals = options.externals ?? [];
  const externalsArray = Array.isArray(existingExternals)
    ? existingExternals
    : [existingExternals];

  return {
    ...options,
    // Exclude transports we don't use from the bundle so Nest doesn't try to resolve
    // their optional dependencies (mqtt, nats, rmq) during webpack build.
    externals: [...externalsArray, optionalMicroserviceModules],
  };
};
