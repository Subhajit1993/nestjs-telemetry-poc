import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer;

  constructor() {
    // Initialize Kafka client with SASL credentials
    this.kafka = new Kafka({
      clientId: 'nestjs-app',
      brokers: ['13.200.177.157:9094'], // Replace with your broker addresses
      ssl: false, // Enable for SASL
      sasl: {
        mechanism: 'plain', // Or 'scram-sha-512', depending on server config
        username: 'pl_dev_user', // Replace with SASL username
        password: 'Plateron@1234', // Replace with SASL password
      },
    });

    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    // Connect producer on module initialization
    console.log('Connecting Kafka producer...');
    await this.producer.connect();
    console.log('Kafka producer connected.');
  }

  async onModuleDestroy() {
    // Disconnect producer on module destruction
    console.log('Disconnecting Kafka producer...');
    await this.producer.disconnect();
    console.log('Kafka producer disconnected.');
  }

  async sendMessage(topic: string, message: string) {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: message }],
      });
      console.log(`Message sent to topic "${topic}"`);
    } catch (error) {
      console.error(`Error sending message to topic "${topic}":`, error);
      throw error;
    }
  }
}
