const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");

const PACKAGE_IMPORT =
  "import com.theposhaven.hardware.ThePosHavenHardwarePackage";
const PACKAGE_ADD = "add(ThePosHavenHardwarePackage())";

module.exports = function withThePosHavenAndroidHardware(config) {
  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const targetRoot = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "theposhaven",
        "hardware",
      );
      fs.mkdirSync(targetRoot, { recursive: true });

      for (const fileName of [
        "ThePosHavenHardwareModule.kt",
        "ThePosHavenHardwarePackage.kt",
      ]) {
        fs.copyFileSync(
          path.join(projectRoot, "native", "android", fileName),
          path.join(targetRoot, fileName),
        );
      }

      return modConfig;
    },
  ]);

  config = withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== "kt") {
      throw new Error("ThePOSHaven Android MainApplication must be Kotlin.");
    }

    let source = modConfig.modResults.contents;

    if (!source.includes(PACKAGE_IMPORT)) {
      const importAnchor = "import com.facebook.react.ReactApplication";
      source = source.replace(
        importAnchor,
        `${importAnchor}\n${PACKAGE_IMPORT}`,
      );
    }

    if (!source.includes(PACKAGE_ADD)) {
      const packageAnchor = "PackageList(this).packages.apply {";
      if (!source.includes(packageAnchor)) {
        throw new Error(
          "ThePOSHaven Android package list anchor could not be resolved.",
        );
      }
      source = source.replace(
        packageAnchor,
        `${packageAnchor}\n              ${PACKAGE_ADD}`,
      );
    }

    modConfig.modResults.contents = source;
    return modConfig;
  });

  return config;
};
