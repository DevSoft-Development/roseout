param environment string
param location string
param tags object
param containerAppsEnvironmentName string
param registryName string
param identityName string
param keyVaultName string
param image string
param gitSha string
param nextPublicSiteUrl string
param nextPublicSupabaseUrl string
@secure()
param nextPublicSupabaseAnonKey string
@secure()
param supabaseServiceRoleKey string
param azureAiEndpoint string
@secure()
param azureAiApiKey string
param azureAiModel string

var envShort = environment == 'production' ? 'prod' : 'stg'
var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)
var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerAppsEnvironmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: registryName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.properties.principalId, acrPullRoleDefinitionId)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.properties.principalId, keyVaultSecretsUserRoleDefinitionId)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

resource supabaseServiceRoleSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'consumer-supabase-service-role-key'
  properties: {
    value: supabaseServiceRoleKey
  }
}

resource azureAiApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'consumer-azure-ai-api-key'
  properties: {
    value: azureAiApiKey
  }
}

resource consumer 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-toh-consumer-${envShort}-primary'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'supabase-service-role-key'
          keyVaultUrl: 'https://${vault.name}.vault.azure.net/secrets/${supabaseServiceRoleSecret.name}'
          identity: identity.id
        }
        {
          name: 'azure-ai-api-key'
          keyVaultUrl: 'https://${vault.name}.vault.azure.net/secrets/${azureAiApiKeySecret.name}'
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'consumer'
          image: image
          env: [
            {
              name: 'PLATFORM_RUNTIME_PROVIDER'
              value: 'azure-consumer'
            }
            {
              name: 'PLATFORM_RUNTIME_GIT_SHA'
              value: gitSha
            }
            {
              name: 'NEXT_PUBLIC_SITE_URL'
              value: nextPublicSiteUrl
            }
            {
              name: 'NEXT_PUBLIC_SUPABASE_URL'
              value: nextPublicSupabaseUrl
            }
            {
              name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
              value: nextPublicSupabaseAnonKey
            }
            {
              name: 'SUPABASE_SERVICE_ROLE_KEY'
              secretRef: 'supabase-service-role-key'
            }
            {
              name: 'AZURE_AI_ENDPOINT'
              value: azureAiEndpoint
            }
            {
              name: 'AZURE_AI_API_KEY'
              secretRef: 'azure-ai-api-key'
            }
            {
              name: 'AZURE_AI_MODEL'
              value: azureAiModel
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health/azure'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 20
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health/azure'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: environment == 'production' ? 1 : 0
        maxReplicas: environment == 'production' ? 4 : 2
      }
    }
  }
  dependsOn: [
    registryPull
    keyVaultSecretsUser
  ]
}

output name string = consumer.name
output fqdn string = consumer.properties.configuration.ingress.fqdn
output image string = image
