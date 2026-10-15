# Continuidad de los secretos: la llave de Sealed Secrets la genera
# Terraform y vive en el ESTADO REMOTO (HCP, cifrado en reposo), no
# solo dentro del cluster. En cada reconstruccion se inyecta como Secret
# con la etiqueta "active" ANTES de que ArgoCD instale el controlador;
# el controlador la adopta en vez de generar una nueva, y los
# SealedSecret del repo GitOps siguen siendo descifrables.
# prevent_destroy: perder esta llave = repositorio ilegible.
resource "tls_private_key" "sealed_secrets" {
  algorithm = "RSA"
  rsa_bits  = 4096

  lifecycle {
    prevent_destroy = true
  }
}

resource "tls_self_signed_cert" "sealed_secrets" {
  private_key_pem       = tls_private_key.sealed_secrets.private_key_pem
  validity_period_hours = 87600 # 10 anios
  allowed_uses          = ["key_encipherment", "digital_signature", "cert_signing"]
  is_ca_certificate     = true

  subject {
    common_name  = "sealed-secret"
    organization = "sealed-secret"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "kubernetes_secret_v1" "sealed_secrets_key" {
  metadata {
    name      = "sealed-secrets-key-sa-p9"
    namespace = "kube-system"
    labels = {
      "sealedsecrets.bitnami.com/sealed-secrets-key" = "active"
    }
  }
  type = "kubernetes.io/tls"
  data = {
    "tls.crt" = tls_self_signed_cert.sealed_secrets.cert_pem
    "tls.key" = tls_private_key.sealed_secrets.private_key_pem
  }

  depends_on = [kind_cluster.sa_p9]
}
