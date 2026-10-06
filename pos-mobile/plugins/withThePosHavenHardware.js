const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withXcodeProject,
} = require("@expo/config-plugins");

const FILE_NAME = "ThePosHavenHardware.swift";

module.exports = function withThePosHavenHardware(config) {
  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const source = path.join(
        modConfig.modRequest.projectRoot,
        "native",
        "ios",
        FILE_NAME,
      );
      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        FILE_NAME,
      );

      fs.copyFileSync(source, destination);
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const target = project.getFirstTarget()?.uuid;
    if (!target) {
      throw new Error("ThePOSHaven iOS target could not be resolved.");
    }

    const existing = project.hasFile(FILE_NAME);
    if (!existing) {
      project.addSourceFile(FILE_NAME, { target });
    }

    return modConfig;
  });

  return config;
};
