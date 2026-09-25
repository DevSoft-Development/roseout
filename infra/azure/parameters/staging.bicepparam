using '../main.bicep'

param environment = 'staging'
param location = 'eastus2'
param secondaryLocation = 'centralus'
param resourceGroupName = 'rg-toh-consumer-staging'

param aiModelDeploymentEnabled = true
param aiModelDeploymentName = 'toh-primary'
param aiModelName = 'gpt-5.4-mini'
param aiModelVersion = '2026-03-17'
param aiModelSkuName = 'DataZoneStandard'
param aiModelCapacity = 10

param consumerContainerAppsEnvironmentEnabled = true
