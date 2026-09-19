output "namespaces_creados" {
  description = "Los ambientes creados por este modulo."
  value       = [for ns in kubernetes_namespace.ambiente : ns.metadata[0].name]
}

output "cuenta_auditor_por_namespace" {
  description = "ServiceAccount de solo lectura disponible en cada ambiente."
  value = {
    for k, sa in kubernetes_service_account.auditor :
    k => sa.metadata[0].name
  }
}
