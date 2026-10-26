import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button, Card, ConfigProvider, Flex, Result, Typography } from 'antd'
import { reportarError } from '../services/reportarError'
import { temaClinica } from '@src/core/tema'

interface Estado { error: Error | null }

/** Última red de seguridad: si una pantalla se rompe, se avisa al soporte y se ofrece recargar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { error: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    // Además de la consola, se avisa al servidor: quien da soporte no tiene
    // forma de ver la consola del navegador de la clínica.
    reportarError(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    // Va fuera del ConfigProvider de main.jsx, así que lleva el tema propio.
    return (
      <ConfigProvider theme={temaClinica}>
        <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
          <Card style={{ maxWidth: 480, width: '100%' }}>
            <Result status="error" title="Ocurrió un error inesperado"
              subTitle="Ya avisamos al soporte técnico automáticamente. Vuelve a cargar la aplicación; si el problema sigue, avisa qué estabas haciendo."
              extra={<Button type="primary" onClick={() => { this.setState({ error: null }); window.location.reload() }}>Recargar aplicación</Button>}>
              <Typography.Paragraph code style={{ wordBreak: 'break-all', marginBottom: 0 }}>{this.state.error.message}</Typography.Paragraph>
            </Result>
          </Card>
        </Flex>
      </ConfigProvider>
    )
  }
}
