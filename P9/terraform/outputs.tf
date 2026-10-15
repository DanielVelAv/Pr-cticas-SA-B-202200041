output "cluster" {
  value = kind_cluster.sa_p9.name
}

output "kube_context" {
  value = "kind-${kind_cluster.sa_p9.name}"
}

output "app_raiz" {
  value = "sa-p9-root (namespace argocd)"
}

output "gitops_repo" {
  value = var.gitops_repo
}

output "respaldos" {
  value = "r2://${var.r2_bucket}/${var.velero_prefijo} (schedule ${var.velero_schedule})"
}

# Certificado PUBLICO para sellar secretos con kubeseal --cert (se puede
# publicar). bootstrap.sh lo escribe en P9/sealed-secrets-pub.pem.
output "sealed_secrets_cert" {
  value = tls_self_signed_cert.sealed_secrets.cert_pem
}

# Llave PRIVADA: solo para la copia fuera de linea (gestor de
# contrasenas). terraform output -raw sealed_secrets_key
output "sealed_secrets_key" {
  value     = tls_private_key.sealed_secrets.private_key_pem
  sensitive = true
}
